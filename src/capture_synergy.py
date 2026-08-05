import json
import re
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd

from playwright.sync_api import (
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

from config.settings import (
    PLAYERS_FILE,
    RAW_PLAYERS_DIR,
    RAW_TEAMS_DIR,
    PROCESSED_SEASON_DIR,
    MATCH_REPORT_FILE,
    FAILED_MATCH_REPORT_FILE,
    API_MANIFEST_FILE,
    BROWSER_PROFILE,
    SYNERGY_HOME,
    SYNERGY_SEASON,
    SYNERGY_SEASON_ID,
    SYNERGY_LEAGUE,
    PLAYER_DATA_SECTIONS,
    PLAYER_SIDES,
)

from src.capture_player_tabs import (
    capture_player_section,
)
from src.capture_team_box import (
    capture_cumulative_box,
)
from src.utils import (
    build_player_team_key,
    ensure_directory,
    read_json,
    slugify,
    write_json,
)


# ============================================================
# SETTINGS
# ============================================================

PAGE_LOAD_WAIT_MS = 5000

API_DOMAIN = (
    "basketball.synergysportstech.com/api/"
)


# ============================================================
# PLAYER URL HELPERS
# ============================================================
def player_capture_is_complete(
    player_folder,
):
    """
    A player is considered completely captured when all four
    player datasets have a valid expanded_tables.json and
    capture_metadata.json.

    This lets future runs skip expensive hierarchy expansion.
    """

    metadata_file = (
        player_folder
        / "metadata.json"
    )

    if not metadata_file.exists():
        return False

    required_captures = [
        (
            "play_types",
            "offense",
        ),
        (
            "play_types",
            "defense",
        ),
        (
            "shot_types",
            "offense",
        ),
        (
            "shot_types",
            "defense",
        ),
    ]

    for section, side in required_captures:

        folder = (
            player_folder
            / section
            / side
        )

        tables_file = (
            folder
            / "expanded_tables.json"
        )

        capture_metadata_file = (
            folder
            / "capture_metadata.json"
        )

        if not tables_file.exists():
            return False

        if not capture_metadata_file.exists():
            return False

        try:
            tables = read_json(
                tables_file
            )

            capture_metadata = read_json(
                capture_metadata_file
            )

        except Exception:
            return False

        if not isinstance(
            tables,
            list,
        ):
            return False

        if len(tables) == 0:
            return False

        if (
            capture_metadata.get(
                "table_count",
                0,
            )
            <= 0
        ):
            return False

    return True


def cumulative_box_is_complete(
    team_folder,
):
    """
    Check whether this team's Cumulative Box was successfully
    saved during an earlier run.
    """

    tables_file = (
        team_folder
        / "cumulative_box_tables.json"
    )

    metadata_file = (
        team_folder
        / "capture_metadata.json"
    )

    if not tables_file.exists():
        return False

    if not metadata_file.exists():
        return False

    try:
        tables = read_json(
            tables_file
        )

        metadata = read_json(
            metadata_file
        )

    except Exception:
        return False

    if not isinstance(
        tables,
        list,
    ):
        return False

    if len(tables) == 0:
        return False

    if (
        metadata.get(
            "table_count",
            0,
        )
        <= 0
    ):
        return False

    if (
        metadata.get(
            "row_count",
            0,
        )
        <= 0
    ):
        return False

    return True


def load_existing_player_metadata(
    player_folder,
):
    """
    Load IDs from the player's existing raw metadata so we
    don't need to search Synergy again.
    """

    metadata_file = (
        player_folder
        / "metadata.json"
    )

    if not metadata_file.exists():
        return None

    try:
        metadata = read_json(
            metadata_file
        )

    except Exception:
        return None

    player_id = (
        metadata.get(
            "player_id"
        )
    )

    season_id = (
        metadata.get(
            "season_id"
        )
    )

    if not player_id:
        return None

    if not season_id:
        return None

    return metadata


def add_existing_capture_audit(
    match_row,
    player_folder,
):
    """
    Populate the player audit using files that already exist
    instead of rerunning the capture.
    """

    for section in (
        PLAYER_DATA_SECTIONS
    ):

        for side in (
            PLAYER_SIDES
        ):

            folder = (
                player_folder
                / section
                / side
            )

            metadata_file = (
                folder
                / "capture_metadata.json"
            )

            capture_metadata = {}

            if metadata_file.exists():

                try:
                    capture_metadata = (
                        read_json(
                            metadata_file
                        )
                    )

                except Exception:
                    capture_metadata = {}

            prefix = (
                f"{section}_"
                f"{side}"
            )

            match_row[
                f"{prefix}_success"
            ] = True

            match_row[
                f"{prefix}_json_count"
            ] = count_json_responses(
                folder
            )

            match_row[
                f"{prefix}_hierarchy_clicks"
            ] = (
                capture_metadata.get(
                    "total_expansion_clicks",
                    0,
                )
            )

            match_row[
                f"{prefix}_error"
            ] = ""

    return match_row

def extract_player_id(url):
    match = re.search(
        r"/players/([a-f0-9]{24})/",
        url,
        re.IGNORECASE,
    )

    if not match:
        return None

    return match.group(1)


def extract_season_id(url):
    match = re.search(
        r"[?&]seasonId=([a-f0-9]{24})",
        url,
        re.IGNORECASE,
    )

    if not match:
        return None

    return match.group(1)


def build_playtypes_url(
    player_id,
    season_id,
):
    return (
        "https://apps.synergysports.com/"
        f"basketball/players/{player_id}/"
        f"playtypes?seasonId={season_id}"
    )


# ============================================================
# LOAD PLAYER LIST
# ============================================================

def load_players():
    if not PLAYERS_FILE.exists():
        raise FileNotFoundError(
            f"Could not find:\n"
            f"{PLAYERS_FILE}"
        )

    df = pd.read_csv(
        PLAYERS_FILE
    )

    required = {
        "player_name",
        "team_name",
    }

    missing = (
        required
        - set(df.columns)
    )

    if missing:
        raise ValueError(
            "players.csv is missing: "
            + ", ".join(
                sorted(missing)
            )
        )

    # If an older players.csv does not yet have this,
    # create it automatically.
    if (
        "player_team_key"
        not in df.columns
    ):
        df["player_team_key"] = (
            df.apply(
                lambda row:
                    build_player_team_key(
                        row["player_name"],
                        row["team_name"],
                    ),
                axis=1,
            )
        )

    df["player_name"] = (
        df["player_name"]
        .astype(str)
        .str.strip()
    )

    df["team_name"] = (
        df["team_name"]
        .astype(str)
        .str.strip()
    )

    df["player_team_key"] = (
        df["player_team_key"]
        .astype(str)
        .str.strip()
    )

    df = df[
        (df["player_name"] != "")
        & (df["team_name"] != "")
    ].copy()

    return df.to_dict(
        orient="records"
    )


# ============================================================
# PLAYER SEARCH
# ============================================================

def search_player(
    page,
    player_name,
    team_name,
):
    print(
        f"  Searching Synergy..."
    )

    # --------------------------------------------------------
    # Open search
    # --------------------------------------------------------
    try:
        page.get_by_text(
            "Search",
            exact=True,
        ).first.click(
            timeout=10000
        )

    except Exception:
        print(
            "  ERROR: could not open search"
        )

        return {
            "status":
                "SEARCH_OPEN_FAILED",
            "player_id":
                None,
            "season_id":
                None,
            "player_url":
                None,
            "selected_text":
                None,
        }

    page.wait_for_timeout(
        700
    )

    # Search field is automatically focused by Synergy.
    page.keyboard.press(
        "Control+A"
    )

    page.keyboard.type(
        player_name,
        delay=35,
    )

    page.wait_for_timeout(
        1800
    )

    # --------------------------------------------------------
    # Find smallest visible DOM element containing:
    #
    # player
    # team
    # 2026-2027
    # International
    #
    # Text is normalized inside JS so Montréal == Montreal.
    # --------------------------------------------------------
    result = page.evaluate(
        """
        ({
            playerName,
            teamName,
            targetSeason,
            targetLeague
        }) => {

            const normalize = (value) => {
                return (value || "")
                    .normalize("NFD")
                    .replace(/[\\u0300-\\u036f]/g, "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, " ")
                    .replace(/\\s+/g, " ")
                    .trim();
            };

            const player =
                normalize(playerName);

            const team =
                normalize(teamName);

            const season =
                normalize(targetSeason);

            const league =
                normalize(targetLeague);

            const elements = Array.from(
                document.querySelectorAll("*")
            );

            const matches = [];

            for (const el of elements) {

                const rect =
                    el.getBoundingClientRect();

                if (
                    rect.width <= 0 ||
                    rect.height <= 0
                ) {
                    continue;
                }

                const text =
                    normalize(
                        el.innerText
                    );

                if (!text) {
                    continue;
                }

                if (
                    text.includes(player)
                    &&
                    text.includes(team)
                    &&
                    text.includes(season)
                    &&
                    text.includes(league)
                ) {
                    matches.push({
                        element: el,
                        text: text,
                        rawText:
                            (
                                el.innerText
                                || ""
                            )
                            .replace(
                                /\\s+/g,
                                " "
                            )
                            .trim(),
                        length:
                            text.length,
                    });
                }
            }

            if (!matches.length) {
                return {
                    found: false,
                    selectedText: null,
                };
            }

            matches.sort(
                (a, b) =>
                    a.length
                    - b.length
            );

            const match =
                matches[0];

            let clickable =
                match.element;

            for (
                let i = 0;
                i < 8;
                i++
            ) {

                if (!clickable) {
                    break;
                }

                const tag =
                    (
                        clickable.tagName
                        || ""
                    )
                    .toLowerCase();

                const role =
                    clickable.getAttribute
                    ? clickable.getAttribute(
                        "role"
                    )
                    : null;

                if (
                    tag === "a"
                    ||
                    tag === "button"
                    ||
                    role === "option"
                    ||
                    role === "button"
                ) {
                    break;
                }

                clickable =
                    clickable.parentElement;
            }

            if (!clickable) {
                clickable =
                    match.element;
            }

            clickable.click();

            return {
                found: true,
                selectedText:
                    match.rawText,
            };
        }
        """,
        {
            "playerName":
                player_name,

            "teamName":
                team_name,

            "targetSeason":
                SYNERGY_SEASON,

            "targetLeague":
                SYNERGY_LEAGUE,
        },
    )

    # --------------------------------------------------------
    # No confident result
    # --------------------------------------------------------
    if not result["found"]:
        try:
            page.keyboard.press(
                "Escape"
            )
        except Exception:
            pass

        return {
            "status":
                "NO_TEAM_MATCH",

            "player_id":
                None,

            "season_id":
                None,

            "player_url":
                None,

            "selected_text":
                None,
        }

    print(
        "  Selected: "
        f"{result['selectedText']}"
    )

    # --------------------------------------------------------
    # Wait for actual player page
    # --------------------------------------------------------
    try:
        page.wait_for_url(
            re.compile(
                r".*/basketball/players/"
                r"[a-f0-9]{24}/.*",
                re.IGNORECASE,
            ),
            timeout=15000,
        )

    except PlaywrightTimeoutError:
        return {
            "status":
                "NAVIGATION_FAILED",

            "player_id":
                None,

            "season_id":
                None,

            "player_url":
                page.url,

            "selected_text":
                result[
                    "selectedText"
                ],
        }

    player_url = page.url

    player_id = extract_player_id(
        player_url
    )

    season_id = extract_season_id(
        player_url
    )

    if (
        season_id
        != SYNERGY_SEASON_ID
    ):
        return {
            "status":
                "WRONG_SEASON",

            "player_id":
                player_id,

            "season_id":
                season_id,

            "player_url":
                player_url,

            "selected_text":
                result[
                    "selectedText"
                ],
        }

    return {
        "status":
            "MATCHED",

        "player_id":
            player_id,

        "season_id":
            season_id,

        "player_url":
            player_url,

        "selected_text":
            result[
                "selectedText"
            ],
    }


# ============================================================
# API CAPTURE
# ============================================================

def create_capture_state():
    return {
        "enabled":
            False,

        "player_name":
            None,

        "team_name":
            None,

        "player_team_key":
            None,

        "player_id":
            None,

        "season_id":
            None,

        "side":
            None,

        "folder":
            None,

        "seen_requests":
            set(),

        "counter":
            0,

        "manifest_rows":
            [],
    }


def start_capture(
    capture_state,
    *,
    player_name,
    team_name,
    player_team_key,
    player_id,
    season_id,
    side,
    folder,
):
    capture_state[
        "enabled"
    ] = True

    capture_state[
        "player_name"
    ] = player_name

    capture_state[
        "team_name"
    ] = team_name

    capture_state[
        "player_team_key"
    ] = player_team_key

    capture_state[
        "player_id"
    ] = player_id

    capture_state[
        "season_id"
    ] = season_id

    capture_state[
        "side"
    ] = side

    capture_state[
        "folder"
    ] = folder

    capture_state[
        "seen_requests"
    ] = set()

    capture_state[
        "counter"
    ] = 0


def stop_capture(
    capture_state,
):
    capture_state[
        "enabled"
    ] = False


def build_api_listener(
    capture_state,
):
    """
    One permanent response listener.

    We do NOT combine this with page.expect_response().
    That avoids the Playwright listener/waiter errors we saw
    in the original test project.
    """

    def record_api_response(
        response,
    ):
        if not capture_state[
            "enabled"
        ]:
            return

        url = response.url

        if API_DOMAIN not in url:
            return

        request = response.request

        method = request.method

        try:
            post_data = (
                request.post_data
                or ""
            )

        except Exception:
            post_data = ""

        request_key = (
            method,
            url,
            post_data,
        )

        if (
            request_key
            in capture_state[
                "seen_requests"
            ]
        ):
            return

        content_type = (
            response.headers
            .get(
                "content-type",
                "",
            )
            .lower()
        )

        if (
            "json"
            not in content_type
        ):
            return

        try:
            response_data = (
                response.json()
            )

        except Exception:
            return

        capture_state[
            "seen_requests"
        ].add(
            request_key
        )

        capture_state[
            "counter"
        ] += 1

        counter = (
            capture_state[
                "counter"
            ]
        )

        parsed_url = urlparse(
            url
        )

        endpoint = (
            parsed_url.path
            .rstrip("/")
            .split("/")[-1]
        )

        endpoint = (
            endpoint
            or "response"
        )

        endpoint = re.sub(
            r"[^A-Za-z0-9_-]+",
            "_",
            endpoint,
        )

        folder = capture_state[
            "folder"
        ]

        ensure_directory(
            folder
        )

        # ----------------------------------------------------
        # Response file
        # ----------------------------------------------------
        response_filename = (
            f"{counter:03d}_"
            f"{endpoint}_response.json"
        )

        response_path = (
            folder
            / response_filename
        )

        write_json(
            response_data,
            response_path,
        )

        # ----------------------------------------------------
        # Request body
        # ----------------------------------------------------
        request_path = None

        if post_data:
            try:
                parsed_request = (
                    json.loads(
                        post_data
                    )
                )

                request_filename = (
                    f"{counter:03d}_"
                    f"{endpoint}_request.json"
                )

                request_path = (
                    folder
                    / request_filename
                )

                write_json(
                    parsed_request,
                    request_path,
                )

            except Exception:
                request_filename = (
                    f"{counter:03d}_"
                    f"{endpoint}_request.txt"
                )

                request_path = (
                    folder
                    / request_filename
                )

                request_path.write_text(
                    post_data,
                    encoding="utf-8",
                )

        manifest_row = {
            "player_name":
                capture_state[
                    "player_name"
                ],

            "team_name":
                capture_state[
                    "team_name"
                ],

            "player_team_key":
                capture_state[
                    "player_team_key"
                ],

            "player_id":
                capture_state[
                    "player_id"
                ],

            "season_id":
                capture_state[
                    "season_id"
                ],

            "side":
                capture_state[
                    "side"
                ],

            "method":
                method,

            "status_code":
                response.status,

            "endpoint":
                parsed_url.path,

            "url":
                url,

            "response_file":
                str(
                    response_path
                ),

            "request_file":
                (
                    str(
                        request_path
                    )
                    if request_path
                    else ""
                ),
        }

        capture_state[
            "manifest_rows"
        ].append(
            manifest_row
        )

        print(
            f"    API "
            f"{counter:03d}: "
            f"{method} "
            f"{parsed_url.path}"
        )

    return record_api_response


# ============================================================
# OFFENSE / DEFENSE PAGE CONTROL
# ============================================================

def load_offense(
    page,
    player_id,
    season_id,
):
    playtypes_url = (
        build_playtypes_url(
            player_id,
            season_id,
        )
    )

    page.goto(
        playtypes_url,
        wait_until="domcontentloaded",
    )

    page.wait_for_timeout(
        PAGE_LOAD_WAIT_MS
    )


def load_defense(
    page,
):
    """
    Switch Play Types page from offense to defense.
    """

    possible_labels = [
        "Defense",
        "DEFENSE",
    ]

    clicked = False

    for label in possible_labels:
        try:
            locator = (
                page.get_by_text(
                    label,
                    exact=True,
                )
                .first
            )

            if locator.is_visible():
                locator.click()

                clicked = True
                break

        except Exception:
            continue

    if not clicked:
        raise RuntimeError(
            "Could not find Defense tab"
        )

    page.wait_for_timeout(
        PAGE_LOAD_WAIT_MS
    )


# ============================================================
# CAPTURE VALIDATION
# ============================================================

def side_has_leaderboard_capture(
    side_folder,
):
    if not side_folder.exists():
        return False

    for path in (
        side_folder.glob(
            "*_records_response.json"
        )
    ):
        if path.is_file():
            return True

    return False


def count_json_responses(
    side_folder,
):
    if not side_folder.exists():
        return 0

    return len(
        list(
            side_folder.glob(
                "*_response.json"
            )
        )
    )


# ============================================================
# SAVE PLAYER METADATA
# ============================================================

def save_metadata(
    player_folder,
    *,
    player_name,
    team_name,
    player_team_key,
    player_id,
    season_id,
    selected_text,
):
    metadata = {
        "player_name":
            player_name,

        "team_name":
            team_name,

        "player_team_key":
            player_team_key,

        "season":
            SYNERGY_SEASON,

        "league":
            SYNERGY_LEAGUE,

        "player_id":
            player_id,

        "season_id":
            season_id,

        "selected_search_result":
            selected_text,
    }

    write_json(
        metadata,
        player_folder
        / "metadata.json",
    )


# ============================================================
# MAIN
# ============================================================

def main():
    players = load_players()

    # ========================================================
    # CREATE REQUIRED FOLDERS
    # ========================================================

    ensure_directory(
        RAW_PLAYERS_DIR
    )

    ensure_directory(
        RAW_TEAMS_DIR
    )

    ensure_directory(
        PROCESSED_SEASON_DIR
    )

    ensure_directory(
        BROWSER_PROFILE
    )

    print()
    print(
        "================================"
    )
    print(
        "CEBL SYNERGY PLAYER CAPTURE"
    )
    print(
        "================================"
    )
    print()

    print(
        f"Player/team rows: "
        f"{len(players)}"
    )

    print(
        f"Season: "
        f"{SYNERGY_SEASON}"
    )

    print()

    match_rows = []

    captured_teams = set()

    capture_state = (
        create_capture_state()
    )

    # ========================================================
    # PLAYWRIGHT
    # ========================================================

    with sync_playwright() as p:

        context = (
            p.chromium
            .launch_persistent_context(
                user_data_dir=str(
                    BROWSER_PROFILE
                ),
                headless=False,
                viewport={
                    "width": 1400,
                    "height": 950,
                },
            )
        )

        if context.pages:

            page = (
                context.pages[0]
            )

        else:

            page = (
                context.new_page()
            )

        # ====================================================
        # API LISTENER
        # ====================================================

        api_listener = (
            build_api_listener(
                capture_state
            )
        )

        page.on(
            "response",
            api_listener,
        )

        # ====================================================
        # OPEN SYNERGY
        # ====================================================

        page.goto(
            SYNERGY_HOME,
            wait_until=
                "domcontentloaded",
        )

        print(
            "If Synergy asks you to log in, "
            "log in normally."
        )

        print()

        input(
            "Once Synergy is ready, "
            "press ENTER..."
        )

        # ====================================================
        # PLAYER LOOP
        # ====================================================

        for index, player in enumerate(
            players,
            start=1,
        ):

            player_name = (
                player[
                    "player_name"
                ]
            )

            team_name = (
                player[
                    "team_name"
                ]
            )

            player_team_key = (
                player.get(
                    "player_team_key"
                )
                or
                build_player_team_key(
                    player_name,
                    team_name,
                )
            )

            player_folder = (
                RAW_PLAYERS_DIR
                / player_team_key
            )

            team_key = slugify(
                team_name
            )

            team_folder = (
                RAW_TEAMS_DIR
                / team_key
                / "cumulative_box"
            )

            print()
            print(
                "================================"
            )

            print(
                f"[{index}/{len(players)}]"
            )

            print(
                f"Player: "
                f"{player_name}"
            )

            print(
                f"Team: "
                f"{team_name}"
            )

            print(
                f"Key: "
                f"{player_team_key}"
            )

            print(
                "================================"
            )

            # =================================================
            # CHECK FOR EXISTING PLAYER CAPTURE
            # =================================================

            existing_player_capture = (
                player_capture_is_complete(
                    player_folder
                )
            )

            existing_metadata = None

            if existing_player_capture:

                existing_metadata = (
                    load_existing_player_metadata(
                        player_folder
                    )
                )

                if existing_metadata is None:

                    existing_player_capture = False

            # =================================================
            # USE EXISTING IDS OR SEARCH SYNERGY
            # =================================================

            if existing_player_capture:

                player_id = (
                    existing_metadata[
                        "player_id"
                    ]
                )

                season_id = (
                    existing_metadata[
                        "season_id"
                    ]
                )

                print(
                    "  Existing player capture "
                    "found."
                )

                print(
                    "  Skipping player search "
                    "and hierarchy expansion."
                )

                print(
                    f"  Player ID: "
                    f"{player_id}"
                )

                match_result = {
                    "status":
                        "MATCHED",

                    "player_id":
                        player_id,

                    "season_id":
                        season_id,

                    "player_url":
                        existing_metadata.get(
                            "player_url"
                        ),

                    "selected_text":
                        existing_metadata.get(
                            "selected_text"
                        ),
                }

            else:

                # =============================================
                # SEARCH PLAYER
                # =============================================

                try:

                    match_result = (
                        search_player(
                            page,
                            player_name,
                            team_name,
                        )
                    )

                except Exception as exc:

                    print(
                        f"  SEARCH ERROR: "
                        f"{exc}"
                    )

                    match_result = {
                        "status":
                            "SEARCH_ERROR",

                        "player_id":
                            None,

                        "season_id":
                            None,

                        "player_url":
                            None,

                        "selected_text":
                            None,
                    }

                player_id = (
                    match_result.get(
                        "player_id"
                    )
                )

                season_id = (
                    match_result.get(
                        "season_id"
                    )
                )

            search_status = (
                match_result.get(
                    "status"
                )
            )

            # =================================================
            # AUDIT ROW
            # =================================================

            match_row = {
                "player_name":
                    player_name,

                "team_name":
                    team_name,

                "player_team_key":
                    player_team_key,

                "status":
                    search_status,

                "player_capture_skipped":
                    existing_player_capture,

                "player_id":
                    player_id,

                "season_id":
                    season_id,

                "player_url":
                    match_result.get(
                        "player_url"
                    ),

                "selected_search_result":
                    match_result.get(
                        "selected_text"
                    ),
            }

            # =================================================
            # FAILED MATCH
            # =================================================

            if (
                search_status
                != "MATCHED"
            ):

                print(
                    f"  SKIPPED: "
                    f"{search_status}"
                )

                match_rows.append(
                    match_row
                )

                continue

            # =================================================
            # CREATE / SAVE PLAYER METADATA
            # =================================================

            ensure_directory(
                player_folder
            )

            if not existing_player_capture:

                save_metadata(
                    player_folder,

                    player_name=
                        player_name,

                    team_name=
                        team_name,

                    player_team_key=
                        player_team_key,

                    player_id=
                        player_id,

                    season_id=
                        season_id,

                    selected_text=
                        match_result.get(
                            "selected_text"
                        ),
                )

            # =================================================
            # TEAM CUMULATIVE BOX
            # =================================================

            team_already_complete = (
                team_key
                in captured_teams
            )

            if not team_already_complete:

                team_already_complete = (
                    cumulative_box_is_complete(
                        team_folder
                    )
                )

                if team_already_complete:

                    captured_teams.add(
                        team_key
                    )

            if team_already_complete:

                print()

                print(
                    f"  Cumulative Box already "
                    f"captured for "
                    f"{team_name} — skipping."
                )

                match_row[
                    "cumulative_box_attempted"
                ] = False

                match_row[
                    "cumulative_box_success"
                ] = True

                match_row[
                    "cumulative_box_table_count"
                ] = ""

                match_row[
                    "cumulative_box_row_count"
                ] = ""

            else:

                print()

                print(
                    f"  Team Cumulative Box "
                    f"not yet captured: "
                    f"{team_name}"
                )

                ensure_directory(
                    team_folder
                )

                start_capture(
                    capture_state,

                    player_name=
                        player_name,

                    team_name=
                        team_name,

                    player_team_key=
                        player_team_key,

                    player_id=
                        player_id,

                    season_id=
                        season_id,

                    side=
                        "team:cumulative_box",

                    folder=
                        team_folder,
                )

                try:

                    cumulative_result = (
                        capture_cumulative_box(
                            page,

                            player_id=
                                player_id,

                            season_id=
                                season_id,

                            team_name=
                                team_name,

                            source_player=
                                player_name,

                            output_folder=
                                team_folder,
                        )
                    )

                    match_row[
                        "cumulative_box_attempted"
                    ] = True

                    match_row[
                        "cumulative_box_success"
                    ] = (
                        cumulative_result.get(
                            "success",
                            False,
                        )
                    )

                    match_row[
                        "cumulative_box_table_count"
                    ] = (
                        cumulative_result.get(
                            "table_count",
                            0,
                        )
                    )

                    match_row[
                        "cumulative_box_row_count"
                    ] = (
                        cumulative_result.get(
                            "row_count",
                            0,
                        )
                    )

                    if cumulative_result.get(
                        "success",
                        False,
                    ):

                        captured_teams.add(
                            team_key
                        )

                        print(
                            f"  Team marked complete: "
                            f"{team_name}"
                        )

                    else:

                        print(
                            f"  Team NOT marked complete. "
                            f"Next {team_name} player "
                            f"will retry."
                        )

                except Exception as exc:

                    print(
                        f"  CUMULATIVE BOX ERROR: "
                        f"{exc}"
                    )

                    match_row[
                        "cumulative_box_attempted"
                    ] = True

                    match_row[
                        "cumulative_box_success"
                    ] = False

                    match_row[
                        "cumulative_box_table_count"
                    ] = 0

                    match_row[
                        "cumulative_box_row_count"
                    ] = 0

                    match_row[
                        "cumulative_box_error"
                    ] = str(
                        exc
                    )

                finally:

                    stop_capture(
                        capture_state
                    )

            # =================================================
            # EXISTING PLAYER DATA
            #
            # Cumulative Box was still allowed above.
            #
            # Now skip the expensive player expansion.
            # =================================================

            if existing_player_capture:

                add_existing_capture_audit(
                    match_row,
                    player_folder,
                )

                match_row[
                    "status"
                ] = "CAPTURED"

                print()

                print(
                    "  Player data already complete "
                    "— no recapture needed."
                )

                print(
                    "  Final status: CAPTURED"
                )

                match_rows.append(
                    match_row
                )

                continue

            # =================================================
            # NEW PLAYER CAPTURE
            # =================================================

            capture_results = {}

            for section in (
                PLAYER_DATA_SECTIONS
            ):

                capture_results[
                    section
                ] = {}

                for side in (
                    PLAYER_SIDES
                ):

                    output_folder = (
                        player_folder
                        / section
                        / side
                    )

                    ensure_directory(
                        output_folder
                    )

                    section_label = (
                        PLAYER_DATA_SECTIONS[
                            section
                        ][
                            "label"
                        ]
                    )

                    print()

                    print(
                        f"  Capturing "
                        f"{section_label} "
                        f"| {side}"
                    )

                    start_capture(
                        capture_state,

                        player_name=
                            player_name,

                        team_name=
                            team_name,

                        player_team_key=
                            player_team_key,

                        player_id=
                            player_id,

                        season_id=
                            season_id,

                        side=(
                            f"{section}:"
                            f"{side}"
                        ),

                        folder=
                            output_folder,
                    )

                    try:

                        expansion_result = (
                            capture_player_section(
                                page,

                                player_id=
                                    player_id,

                                season_id=
                                    season_id,

                                section=
                                    section,

                                side=
                                    side,

                                output_folder=
                                    output_folder,
                            )
                        )

                        json_count = (
                            count_json_responses(
                                output_folder
                            )
                        )

                        hierarchy_clicks = (
                            expansion_result.get(
                                "total_expansion_clicks",
                                0,
                            )
                        )

                        capture_results[
                            section
                        ][
                            side
                        ] = {
                            "success":
                                True,

                            "json_count":
                                json_count,

                            "hierarchy_clicks":
                                hierarchy_clicks,

                            "error":
                                "",
                        }

                        print(
                            f"    JSON responses: "
                            f"{json_count}"
                        )

                        print(
                            f"    Hierarchy expansions: "
                            f"{hierarchy_clicks}"
                        )

                    except Exception as exc:

                        print(
                            f"    CAPTURE ERROR: "
                            f"{exc}"
                        )

                        capture_results[
                            section
                        ][
                            side
                        ] = {
                            "success":
                                False,

                            "json_count":
                                count_json_responses(
                                    output_folder
                                ),

                            "hierarchy_clicks":
                                0,

                            "error":
                                str(
                                    exc
                                ),
                        }

                    finally:

                        stop_capture(
                            capture_state
                        )

            # =================================================
            # PLAYER AUDIT
            # =================================================

            all_complete = True

            for section in (
                PLAYER_DATA_SECTIONS
            ):

                for side in (
                    PLAYER_SIDES
                ):

                    result = (
                        capture_results
                        .get(
                            section,
                            {},
                        )
                        .get(
                            side,
                            {},
                        )
                    )

                    prefix = (
                        f"{section}_"
                        f"{side}"
                    )

                    success = (
                        result.get(
                            "success",
                            False,
                        )
                    )

                    match_row[
                        f"{prefix}_success"
                    ] = success

                    match_row[
                        f"{prefix}_json_count"
                    ] = result.get(
                        "json_count",
                        0,
                    )

                    match_row[
                        f"{prefix}_hierarchy_clicks"
                    ] = result.get(
                        "hierarchy_clicks",
                        0,
                    )

                    match_row[
                        f"{prefix}_error"
                    ] = result.get(
                        "error",
                        "",
                    )

                    if not success:

                        all_complete = False

            if all_complete:

                match_row[
                    "status"
                ] = "CAPTURED"

            else:

                match_row[
                    "status"
                ] = (
                    "INCOMPLETE_CAPTURE"
                )

            print()

            print(
                f"  Final status: "
                f"{match_row['status']}"
            )

            match_rows.append(
                match_row
            )

        context.close()

    # ========================================================
    # SAVE AUDIT
    # ========================================================

    match_df = pd.DataFrame(
        match_rows
    )

    ensure_directory(
        MATCH_REPORT_FILE.parent
    )

    match_df.to_csv(
        MATCH_REPORT_FILE,
        index=False,
    )

    if not match_df.empty:

        failed_df = (
            match_df[
                match_df[
                    "status"
                ]
                != "CAPTURED"
            ]
            .copy()
        )

    else:

        failed_df = (
            pd.DataFrame()
        )

    failed_df.to_csv(
        FAILED_MATCH_REPORT_FILE,
        index=False,
    )

    # ========================================================
    # API MANIFEST
    # ========================================================

    manifest_rows = (
        capture_state[
            "manifest_rows"
        ]
    )

    if manifest_rows:

        manifest_df = (
            pd.DataFrame(
                manifest_rows
            )
        )

    else:

        manifest_df = (
            pd.DataFrame()
        )

    manifest_df.to_csv(
        API_MANIFEST_FILE,
        index=False,
    )

    # ========================================================
    # SUMMARY
    # ========================================================

    if not match_df.empty:

        captured_count = (
            match_df[
                "status"
            ]
            .eq(
                "CAPTURED"
            )
            .sum()
        )

        skipped_existing_count = (
            match_df[
                "player_capture_skipped"
            ]
            .fillna(
                False
            )
            .sum()
        )

    else:

        captured_count = 0
        skipped_existing_count = 0

    failed_count = (
        len(match_df)
        - captured_count
    )

    print()
    print(
        "================================"
    )
    print(
        "CAPTURE COMPLETE"
    )
    print(
        "================================"
    )
    print()

    print(
        f"Player/team rows: "
        f"{len(match_df)}"
    )

    print(
        f"Fully captured: "
        f"{captured_count}"
    )

    print(
        f"Skipped existing players: "
        f"{skipped_existing_count}"
    )

    print(
        f"Failed/incomplete: "
        f"{failed_count}"
    )

    print(
        f"Teams with Cumulative Box: "
        f"{len(captured_teams)}"
    )

    print()

    print(
        "Player audit:"
    )

    print(
        MATCH_REPORT_FILE
    )

    print()

    print(
        "Failed/incomplete report:"
    )

    print(
        FAILED_MATCH_REPORT_FILE
    )

    print()

    print(
        "Raw player data:"
    )

    print(
        RAW_PLAYERS_DIR
    )

    print()

    print(
        "Raw team data:"
    )

    print(
        RAW_TEAMS_DIR
    )

    print()

    print(
        "API manifest:"
    )

    print(
        API_MANIFEST_FILE
    )


if __name__ == "__main__":
    main()