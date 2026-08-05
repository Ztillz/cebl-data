import json
import re
import sys
from pathlib import Path

import pandas as pd

from config.settings import (
    PLAYERS_FILE,
    RAW_PLAYERS_DIR,
    RAW_TEAMS_DIR,
    PROCESSED_PLAYERS_DIR,
    PROCESSED_TEAMS_DIR,
    PROCESSED_SEASON_DIR,
    COMBINED_DIR,
    PLAYER_DATA_SECTIONS,
    PLAYER_SIDES,
)

from src.utils import (
    build_player_team_key,
    read_json,
    slugify,
)


# ============================================================
# SETTINGS
# ============================================================

VALIDATION_REPORT_FILE = (
    PROCESSED_SEASON_DIR
    / "validation_report.csv"
)


FORBIDDEN_PROCESSED_KEYS = {
    "player_id",
    "team_id",
    "season_id",
    "league_id",
    "competition_key",
    "row_index",
    "cells",
    "source_idd",
    "source_expression",
    "request_expression",
    "mapping_status",
    "api_url",
    "request_url",
}


# Synergy/ObjectId style IDs are normally 24 hex characters.
OBJECT_ID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{24}$"
)


# ============================================================
# VALIDATION RESULT STORAGE
# ============================================================

issues = []


def add_issue(
    severity,
    category,
    message,
    *,
    player="",
    team="",
    section="",
    side="",
    file="",
):
    issues.append(
        {
            "SEVERITY":
                severity,

            "CATEGORY":
                category,

            "PLAYER":
                player,

            "TEAM":
                team,

            "SECTION":
                section,

            "SIDE":
                side,

            "FILE":
                str(file)
                if file
                else "",

            "MESSAGE":
                message,
        }
    )


def add_error(
    category,
    message,
    **kwargs,
):
    add_issue(
        "ERROR",
        category,
        message,
        **kwargs,
    )


def add_warning(
    category,
    message,
    **kwargs,
):
    add_issue(
        "WARNING",
        category,
        message,
        **kwargs,
    )


# ============================================================
# GENERAL HELPERS
# ============================================================

def clean_value(
    value,
):
    if value is None:
        return ""

    try:
        if pd.isna(
            value
        ):
            return ""
    except Exception:
        pass

    return str(
        value
    ).strip()


def read_csv_safe(
    path,
):
    path = Path(
        path
    )

    if not path.exists():
        return None

    try:
        return pd.read_csv(
            path
        )

    except Exception as exc:
        add_error(
            "FILE_READ",
            f"Could not read CSV: {exc}",
            file=path,
        )

        return None


def read_json_safe(
    path,
):
    path = Path(
        path
    )

    if not path.exists():
        return None

    try:
        return read_json(
            path
        )

    except Exception as exc:
        add_error(
            "FILE_READ",
            f"Could not read JSON: {exc}",
            file=path,
        )

        return None


def count_raw_table_rows(
    tables,
):
    if not isinstance(
        tables,
        list,
    ):
        return 0

    total = 0

    for table in tables:

        rows = table.get(
            "rows",
            [],
        )

        if isinstance(
            rows,
            list,
        ):
            total += len(
                rows
            )

    return total


def count_tree_nodes(
    tree_data,
):
    if not isinstance(
        tree_data,
        dict,
    ):
        return 0

    total = 0

    def walk(
        nodes,
    ):
        nonlocal total

        if not isinstance(
            nodes,
            list,
        ):
            return

        for node in nodes:

            if not isinstance(
                node,
                dict,
            ):
                continue

            total += 1

            walk(
                node.get(
                    "children",
                    [],
                )
            )

    for table in tree_data.get(
        "tables",
        [],
    ):

        walk(
            table.get(
                "rows",
                [],
            )
        )

    return total


# ============================================================
# PROCESSED DATA LEAK CHECK
# ============================================================

def normalize_key(
    value,
):
    value = str(
        value
    ).strip().lower()

    value = re.sub(
        r"[^a-z0-9]+",
        "_",
        value,
    )

    return value.strip(
        "_"
    )


def scan_json_for_internal_data(
    data,
    *,
    file,
    path="root",
):
    """
    Make sure technical capture information does not leak into
    public/processed JSON.
    """

    if isinstance(
        data,
        dict,
    ):

        for key, value in data.items():

            normalized_key = (
                normalize_key(
                    key
                )
            )

            if (
                normalized_key
                in FORBIDDEN_PROCESSED_KEYS
            ):
                add_error(
                    "TECHNICAL_DATA_LEAK",
                    (
                        f"Forbidden processed JSON key "
                        f"'{key}' found at "
                        f"{path}."
                    ),
                    file=file,
                )

            scan_json_for_internal_data(
                value,
                file=file,
                path=f"{path}.{key}",
            )

    elif isinstance(
        data,
        list,
    ):

        for index, value in enumerate(
            data
        ):
            scan_json_for_internal_data(
                value,
                file=file,
                path=f"{path}[{index}]",
            )

    elif isinstance(
        data,
        str,
    ):

        text = data.strip()

        if OBJECT_ID_PATTERN.fullmatch(
            text
        ):
            add_error(
                "TECHNICAL_DATA_LEAK",
                (
                    f"Possible Synergy ObjectId "
                    f"found at {path}: "
                    f"{text}"
                ),
                file=file,
            )


def validate_csv_no_internal_columns(
    df,
    *,
    file,
):
    if df is None:
        return

    for column in df.columns:

        normalized = normalize_key(
            column
        )

        if (
            normalized
            in FORBIDDEN_PROCESSED_KEYS
        ):
            add_error(
                "TECHNICAL_DATA_LEAK",
                (
                    f"Forbidden processed CSV "
                    f"column: {column}"
                ),
                file=file,
            )


# ============================================================
# CSV HIERARCHY VALIDATION
# ============================================================

def validate_hierarchy_csv(
    df,
    *,
    player,
    team,
    section,
    side,
    file,
):
    """
    Validate the flat CSV hierarchy.

    Important:
    We DO NOT split PATH using " > " because legitimate
    Synergy labels can contain that text themselves.

    Example:
        High, SSQ > 80th Percentile

    LEVEL_1, LEVEL_2, etc. are therefore the authoritative
    hierarchy fields.
    """

    required_columns = {
        "TABLE",
        "STAT",
        "DEPTH",
        "PARENT",
        "PATH",
    }

    missing = (
        required_columns
        - set(
            df.columns
        )
    )

    if missing:

        add_error(
            "HIERARCHY",
            (
                "Missing hierarchy columns: "
                + ", ".join(
                    sorted(
                        missing
                    )
                )
            ),
            player=player,
            team=team,
            section=section,
            side=side,
            file=file,
        )

        return

    # ========================================================
    # FIND AVAILABLE LEVEL COLUMNS
    # ========================================================

    max_level_column = 0

    for column in df.columns:

        match = re.fullmatch(
            r"LEVEL_(\d+)",
            column,
        )

        if match:

            max_level_column = max(
                max_level_column,
                int(
                    match.group(
                        1
                    )
                ),
            )

    max_depth_seen = 0

    # ========================================================
    # VALIDATE EACH SYNERGY TABLE INDEPENDENTLY
    # ========================================================

    for table_name, table_df in df.groupby(
        "TABLE",
        sort=False,
        dropna=False,
    ):

        stack = []

        paths_seen = set()

        for _, row in table_df.iterrows():

            stat = clean_value(
                row.get(
                    "STAT"
                )
            )

            path = clean_value(
                row.get(
                    "PATH"
                )
            )

            parent = clean_value(
                row.get(
                    "PARENT"
                )
            )

            # =================================================
            # DEPTH
            # =================================================

            try:
                depth = int(
                    row.get(
                        "DEPTH"
                    )
                )

            except Exception:

                add_error(
                    "HIERARCHY",
                    (
                        f"Invalid DEPTH for "
                        f"'{stat}'."
                    ),
                    player=player,
                    team=team,
                    section=section,
                    side=side,
                    file=file,
                )

                continue

            if depth < 1:

                add_error(
                    "HIERARCHY",
                    (
                        f"DEPTH below 1 for "
                        f"'{stat}'."
                    ),
                    player=player,
                    team=team,
                    section=section,
                    side=side,
                    file=file,
                )

                continue

            max_depth_seen = max(
                max_depth_seen,
                depth,
            )

            # =================================================
            # LEVEL COLUMNS
            # =================================================

            level_values = []

            for level in range(
                1,
                depth + 1,
            ):

                column = (
                    f"LEVEL_{level}"
                )

                if column not in df.columns:

                    add_error(
                        "HIERARCHY",
                        (
                            f"Missing {column} for "
                            f"depth {depth}."
                        ),
                        player=player,
                        team=team,
                        section=section,
                        side=side,
                        file=file,
                    )

                    level_values.append(
                        ""
                    )

                    continue

                level_value = clean_value(
                    row.get(
                        column
                    )
                )

                level_values.append(
                    level_value
                )

            # =================================================
            # CURRENT STAT MUST MATCH FINAL LEVEL
            # =================================================

            if level_values:

                expected_stat = (
                    level_values[-1]
                )

                if expected_stat != stat:

                    add_error(
                        "HIERARCHY",
                        (
                            f"Final hierarchy level "
                            f"does not match STAT for "
                            f"'{stat}'. "
                            f"Found "
                            f"'{expected_stat}'."
                        ),
                        player=player,
                        team=team,
                        section=section,
                        side=side,
                        file=file,
                    )

            # =================================================
            # PATH
            #
            # Construct expected PATH from LEVEL columns instead
            # of splitting PATH itself.
            # =================================================

            expected_path = (
                " > ".join(
                    level_values
                )
            )

            if path != expected_path:

                add_error(
                    "HIERARCHY",
                    (
                        f"PATH mismatch for "
                        f"'{stat}'. "
                        f"Expected "
                        f"'{expected_path}', "
                        f"got '{path}'."
                    ),
                    player=player,
                    team=team,
                    section=section,
                    side=side,
                    file=file,
                )

            # =================================================
            # ROOT
            # =================================================

            if depth == 1:

                if parent:

                    add_error(
                        "HIERARCHY",
                        (
                            f"Root row '{stat}' "
                            f"has parent "
                            f"'{parent}'."
                        ),
                        player=player,
                        team=team,
                        section=section,
                        side=side,
                        file=file,
                    )

                stack = [
                    stat
                ]

            # =================================================
            # CHILD
            # =================================================

            else:

                expected_parent = (
                    stack[
                        depth - 2
                    ]
                    if len(
                        stack
                    ) >= depth - 1
                    else ""
                )

                if not expected_parent:

                    add_error(
                        "HIERARCHY",
                        (
                            f"No valid parent stack "
                            f"for '{stat}' at "
                            f"depth {depth}."
                        ),
                        player=player,
                        team=team,
                        section=section,
                        side=side,
                        file=file,
                    )

                elif (
                    parent
                    != expected_parent
                ):

                    add_error(
                        "HIERARCHY",
                        (
                            f"Parent mismatch for "
                            f"'{stat}'. "
                            f"Expected "
                            f"'{expected_parent}', "
                            f"got '{parent}'."
                        ),
                        player=player,
                        team=team,
                        section=section,
                        side=side,
                        file=file,
                    )

                while len(
                    stack
                ) >= depth:

                    stack.pop()

                stack.append(
                    stat
                )

            # =================================================
            # DUPLICATE TABLE + PATH
            # =================================================

            if path in paths_seen:

                add_error(
                    "HIERARCHY",
                    (
                        f"Duplicate TABLE + PATH: "
                        f"'{table_name}' / "
                        f"'{path}'."
                    ),
                    player=player,
                    team=team,
                    section=section,
                    side=side,
                    file=file,
                )

            paths_seen.add(
                path
            )

    # ========================================================
    # ENSURE LEVEL COLUMNS SUPPORT DEEPEST HIERARCHY
    # ========================================================

    if (
        max_depth_seen
        > max_level_column
    ):

        add_error(
            "HIERARCHY",
            (
                f"Maximum depth is "
                f"{max_depth_seen}, but only "
                f"LEVEL_1 through "
                f"LEVEL_{max_level_column} "
                f"exist."
            ),
            player=player,
            team=team,
            section=section,
            side=side,
            file=file,
        )

# ============================================================
# TREE VALIDATION
# ============================================================

def validate_tree_structure(
    tree_data,
    *,
    player,
    team,
    section,
    side,
    file,
):
    if not isinstance(
        tree_data,
        dict,
    ):

        add_error(
            "TREE_JSON",
            "Tree JSON root is not an object.",
            player=player,
            team=team,
            section=section,
            side=side,
            file=file,
        )

        return

    def walk(
        nodes,
        *,
        parent_path="",
        parent_stat="",
        expected_depth=1,
    ):

        if not isinstance(
            nodes,
            list,
        ):

            add_error(
                "TREE_JSON",
                (
                    f"Children at "
                    f"'{parent_path}' "
                    f"are not a list."
                ),
                player=player,
                team=team,
                section=section,
                side=side,
                file=file,
            )

            return

        for node in nodes:

            if not isinstance(
                node,
                dict,
            ):
                continue

            stat = clean_value(
                node.get(
                    "stat"
                )
            )

            path = clean_value(
                node.get(
                    "path"
                )
            )

            parent = clean_value(
                node.get(
                    "parent"
                )
            )

            try:
                depth = int(
                    node.get(
                        "depth",
                        0,
                    )
                )

            except Exception:
                depth = 0

            if (
                depth
                != expected_depth
            ):

                add_error(
                    "TREE_JSON",
                    (
                        f"Tree depth mismatch for "
                        f"'{stat}'. Expected "
                        f"{expected_depth}, got "
                        f"{depth}."
                    ),
                    player=player,
                    team=team,
                    section=section,
                    side=side,
                    file=file,
                )

            if expected_depth == 1:

                expected_path = stat

                if parent:

                    add_error(
                        "TREE_JSON",
                        (
                            f"Root tree node "
                            f"'{stat}' has parent "
                            f"'{parent}'."
                        ),
                        player=player,
                        team=team,
                        section=section,
                        side=side,
                        file=file,
                    )

            else:

                expected_path = (
                    f"{parent_path} > {stat}"
                )

                if (
                    parent
                    != parent_stat
                ):

                    add_error(
                        "TREE_JSON",
                        (
                            f"Tree parent mismatch "
                            f"for '{stat}'. "
                            f"Expected "
                            f"'{parent_stat}', "
                            f"got '{parent}'."
                        ),
                        player=player,
                        team=team,
                        section=section,
                        side=side,
                        file=file,
                    )

            if path != expected_path:

                add_error(
                    "TREE_JSON",
                    (
                        f"Tree PATH mismatch for "
                        f"'{stat}'. Expected "
                        f"'{expected_path}', "
                        f"got '{path}'."
                    ),
                    player=player,
                    team=team,
                    section=section,
                    side=side,
                    file=file,
                )

            walk(
                node.get(
                    "children",
                    [],
                ),
                parent_path=path,
                parent_stat=stat,
                expected_depth=(
                    expected_depth
                    + 1
                ),
            )

    for table in tree_data.get(
        "tables",
        [],
    ):

        walk(
            table.get(
                "rows",
                [],
            )
        )


# ============================================================
# PLAYER VALIDATION
# ============================================================

def load_expected_players():
    df = read_csv_safe(
        PLAYERS_FILE
    )

    if (
        df is None
        or
        df.empty
    ):
        add_error(
            "INPUT",
            "players.csv is missing or empty.",
            file=PLAYERS_FILE,
        )

        return []

    required = {
        "player_name",
        "team_name",
    }

    missing = (
        required
        - set(
            df.columns
        )
    )

    if missing:

        add_error(
            "INPUT",
            (
                "players.csv missing columns: "
                + ", ".join(
                    sorted(
                        missing
                    )
                )
            ),
            file=PLAYERS_FILE,
        )

        return []

    output = []

    for _, row in df.iterrows():

        player_name = clean_value(
            row[
                "player_name"
            ]
        )

        team_name = clean_value(
            row[
                "team_name"
            ]
        )

        player_team_key = (
            clean_value(
                row.get(
                    "player_team_key"
                )
            )
            or
            build_player_team_key(
                player_name,
                team_name,
            )
        )

        output.append(
            {
                "player_name":
                    player_name,

                "team_name":
                    team_name,

                "player_team_key":
                    player_team_key,
            }
        )

    return output


def validate_player_section_side(
    *,
    player_name,
    team_name,
    player_team_key,
    section,
    side,
):
    raw_folder = (
        RAW_PLAYERS_DIR
        / player_team_key
        / section
        / side
    )

    processed_folder = (
        PROCESSED_PLAYERS_DIR
        / player_team_key
        / section
    )

    raw_file = (
        raw_folder
        / "expanded_tables.json"
    )

    csv_file = (
        processed_folder
        / f"{side}.csv"
    )

    flat_json_file = (
        processed_folder
        / f"{side}.json"
    )

    tree_json_file = (
        processed_folder
        / f"{side}_tree.json"
    )

    # --------------------------------------------------------
    # REQUIRED FILES
    # --------------------------------------------------------

    for file in (
        raw_file,
        csv_file,
        flat_json_file,
        tree_json_file,
    ):

        if not file.exists():

            add_error(
                "MISSING_FILE",
                "Required capture/output file is missing.",
                player=player_name,
                team=team_name,
                section=section,
                side=side,
                file=file,
            )

    if not raw_file.exists():
        return

    if not csv_file.exists():
        return

    if not flat_json_file.exists():
        return

    if not tree_json_file.exists():
        return

    raw_tables = (
        read_json_safe(
            raw_file
        )
    )

    df = read_csv_safe(
        csv_file
    )

    flat_json = (
        read_json_safe(
            flat_json_file
        )
    )

    tree_json = (
        read_json_safe(
            tree_json_file
        )
    )

    if (
        raw_tables is None
        or
        df is None
        or
        flat_json is None
        or
        tree_json is None
    ):
        return

    # --------------------------------------------------------
    # ROW COUNTS
    # --------------------------------------------------------

    raw_count = (
        count_raw_table_rows(
            raw_tables
        )
    )

    csv_count = len(
        df
    )

    flat_count = (
        len(
            flat_json
        )
        if isinstance(
            flat_json,
            list,
        )
        else -1
    )

    tree_count = (
        count_tree_nodes(
            tree_json
        )
    )

    counts = {
        "raw":
            raw_count,

        "csv":
            csv_count,

        "flat_json":
            flat_count,

        "tree_json":
            tree_count,
    }

    if len(
        set(
            counts.values()
        )
    ) != 1:

        add_error(
            "ROW_COUNT",
            (
                f"Row counts do not match: "
                f"{counts}"
            ),
            player=player_name,
            team=team_name,
            section=section,
            side=side,
            file=csv_file,
        )

    # --------------------------------------------------------
    # PLAYER / TEAM IDENTITY
    # --------------------------------------------------------

    if not df.empty:

        players_found = set(
            df[
                "PLAYER"
            ]
            .dropna()
            .astype(
                str
            )
            .str.strip()
            .tolist()
        )

        teams_found = set(
            df[
                "TEAM"
            ]
            .dropna()
            .astype(
                str
            )
            .str.strip()
            .tolist()
        )

        if players_found != {
            player_name
        }:

            add_error(
                "IDENTITY",
                (
                    f"CSV player values do not "
                    f"match expected player. "
                    f"Found: "
                    f"{sorted(players_found)}"
                ),
                player=player_name,
                team=team_name,
                section=section,
                side=side,
                file=csv_file,
            )

        if teams_found != {
            team_name
        }:

            add_error(
                "IDENTITY",
                (
                    f"CSV team values do not "
                    f"match expected team. "
                    f"Found: "
                    f"{sorted(teams_found)}"
                ),
                player=player_name,
                team=team_name,
                section=section,
                side=side,
                file=csv_file,
            )

    # --------------------------------------------------------
    # HIERARCHY
    # --------------------------------------------------------

    validate_hierarchy_csv(
        df,
        player=player_name,
        team=team_name,
        section=section,
        side=side,
        file=csv_file,
    )

    validate_tree_structure(
        tree_json,
        player=player_name,
        team=team_name,
        section=section,
        side=side,
        file=tree_json_file,
    )

    # --------------------------------------------------------
    # TECHNICAL DATA LEAK
    # --------------------------------------------------------

    validate_csv_no_internal_columns(
        df,
        file=csv_file,
    )

    scan_json_for_internal_data(
        flat_json,
        file=flat_json_file,
    )

    scan_json_for_internal_data(
        tree_json,
        file=tree_json_file,
    )


def validate_players(
    expected_players,
):
    print()
    print(
        "================================"
    )
    print(
        "VALIDATING PLAYERS"
    )
    print(
        "================================"
    )

    for index, player in enumerate(
        expected_players,
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
            player[
                "player_team_key"
            ]
        )

        print(
            f"[{index}/{len(expected_players)}] "
            f"{player_name} | "
            f"{team_name}"
        )

        raw_player_folder = (
            RAW_PLAYERS_DIR
            / player_team_key
        )

        processed_player_folder = (
            PROCESSED_PLAYERS_DIR
            / player_team_key
        )

        if not raw_player_folder.exists():

            add_error(
                "MISSING_PLAYER",
                "Raw player folder is missing.",
                player=player_name,
                team=team_name,
                file=raw_player_folder,
            )

            continue

        if not processed_player_folder.exists():

            add_error(
                "MISSING_PLAYER",
                (
                    "Processed player folder "
                    "is missing."
                ),
                player=player_name,
                team=team_name,
                file=processed_player_folder,
            )

            continue

        # ----------------------------------------------------
        # CLEAN player.json
        # ----------------------------------------------------

        player_json_file = (
            processed_player_folder
            / "player.json"
        )

        if not player_json_file.exists():

            add_error(
                "MISSING_FILE",
                "player.json is missing.",
                player=player_name,
                team=team_name,
                file=player_json_file,
            )

        else:

            player_json = (
                read_json_safe(
                    player_json_file
                )
            )

            if player_json:

                if (
                    clean_value(
                        player_json.get(
                            "player"
                        )
                    )
                    != player_name
                ):

                    add_error(
                        "IDENTITY",
                        (
                            "player.json player "
                            "does not match."
                        ),
                        player=player_name,
                        team=team_name,
                        file=player_json_file,
                    )

                if (
                    clean_value(
                        player_json.get(
                            "team"
                        )
                    )
                    != team_name
                ):

                    add_error(
                        "IDENTITY",
                        (
                            "player.json team "
                            "does not match."
                        ),
                        player=player_name,
                        team=team_name,
                        file=player_json_file,
                    )

                scan_json_for_internal_data(
                    player_json,
                    file=player_json_file,
                )

        # ----------------------------------------------------
        # FOUR PLAYER OUTPUTS
        # ----------------------------------------------------

        for section in (
            PLAYER_DATA_SECTIONS
        ):

            for side in (
                PLAYER_SIDES
            ):

                validate_player_section_side(
                    player_name=
                        player_name,

                    team_name=
                        team_name,

                    player_team_key=
                        player_team_key,

                    section=
                        section,

                    side=
                        side,
                )


# ============================================================
# TEAM CUMULATIVE BOX VALIDATION
# ============================================================

def validate_teams(
    expected_players,
):
    expected_teams = {}

    for player in expected_players:

        team_name = (
            player[
                "team_name"
            ]
        )

        team_key = slugify(
            team_name
        )

        expected_teams[
            team_key
        ] = team_name

    print()
    print(
        "================================"
    )
    print(
        "VALIDATING TEAM CUMULATIVE BOX"
    )
    print(
        "================================"
    )

    for team_key, team_name in sorted(
        expected_teams.items()
    ):

        print(
            team_name
        )

        raw_folder = (
            RAW_TEAMS_DIR
            / team_key
            / "cumulative_box"
        )

        processed_folder = (
            PROCESSED_TEAMS_DIR
            / team_key
        )

        raw_file = (
            raw_folder
            / "cumulative_box_tables.json"
        )

        csv_file = (
            processed_folder
            / "cumulative_box.csv"
        )

        json_file = (
            processed_folder
            / "cumulative_box.json"
        )

        for file in (
            raw_file,
            csv_file,
            json_file,
        ):

            if not file.exists():

                add_error(
                    "MISSING_TEAM",
                    (
                        "Required Cumulative Box "
                        "file is missing."
                    ),
                    team=team_name,
                    file=file,
                )

        if not (
            raw_file.exists()
            and
            csv_file.exists()
            and
            json_file.exists()
        ):
            continue

        raw_tables = (
            read_json_safe(
                raw_file
            )
        )

        df = (
            read_csv_safe(
                csv_file
            )
        )

        json_data = (
            read_json_safe(
                json_file
            )
        )

        if (
            raw_tables is None
            or
            df is None
            or
            json_data is None
        ):
            continue

        raw_count = (
            count_raw_table_rows(
                raw_tables
            )
        )

        csv_count = len(
            df
        )

        json_count = (
            len(
                json_data
            )
            if isinstance(
                json_data,
                list,
            )
            else -1
        )

        if not (
            raw_count
            ==
            csv_count
            ==
            json_count
        ):

            add_error(
                "ROW_COUNT",
                (
                    f"Cumulative Box counts "
                    f"do not match. "
                    f"raw={raw_count}, "
                    f"csv={csv_count}, "
                    f"json={json_count}"
                ),
                team=team_name,
                file=csv_file,
            )

        # ----------------------------------------------------
        # TEAM NAME
        # ----------------------------------------------------

        if (
            df is not None
            and
            not df.empty
            and
            "TEAM" in df.columns
        ):

            found_teams = set(
                df[
                    "TEAM"
                ]
                .dropna()
                .astype(
                    str
                )
                .str.strip()
                .tolist()
            )

            if found_teams != {
                team_name
            }:

                add_error(
                    "IDENTITY",
                    (
                        f"Cumulative Box TEAM "
                        f"values do not match. "
                        f"Found: "
                        f"{sorted(found_teams)}"
                    ),
                    team=team_name,
                    file=csv_file,
                )

        # ----------------------------------------------------
        # PLAYER NAMES
        # ----------------------------------------------------

        if (
            df is not None
            and
            "PLAYER" in df.columns
        ):

            duplicate_players = (
                df[
                    "PLAYER"
                ]
                .duplicated(
                    keep=False
                )
            )

            if duplicate_players.any():

                duplicate_names = sorted(
                    df.loc[
                        duplicate_players,
                        "PLAYER",
                    ]
                    .astype(
                        str
                    )
                    .unique()
                    .tolist()
                )

                add_error(
                    "DUPLICATE_PLAYER",
                    (
                        "Duplicate players in "
                        "Cumulative Box: "
                        + ", ".join(
                            duplicate_names
                        )
                    ),
                    team=team_name,
                    file=csv_file,
                )

            jersey_names = (
                df[
                    "PLAYER"
                ]
                .fillna(
                    ""
                )
                .astype(
                    str
                )
                .str.match(
                    r"^#\d+\s+"
                )
            )

            if jersey_names.any():

                add_error(
                    "PLAYER_NAME_CLEANUP",
                    (
                        "Jersey-number prefixes "
                        "remain in processed "
                        "Cumulative Box."
                    ),
                    team=team_name,
                    file=csv_file,
                )

        validate_csv_no_internal_columns(
            df,
            file=csv_file,
        )

        scan_json_for_internal_data(
            json_data,
            file=json_file,
        )


# ============================================================
# COMBINED OUTPUT VALIDATION
# ============================================================

def sum_player_file_rows(
    expected_players,
    *,
    section,
):
    total = 0

    for player in expected_players:

        key = (
            player[
                "player_team_key"
            ]
        )

        for side in (
            PLAYER_SIDES
        ):

            file = (
                PROCESSED_PLAYERS_DIR
                / key
                / section
                / f"{side}.csv"
            )

            df = read_csv_safe(
                file
            )

            if df is not None:
                total += len(
                    df
                )

    return total


def sum_team_file_rows(
    expected_players,
):
    teams = {
        slugify(
            player[
                "team_name"
            ]
        )
        for player
        in expected_players
    }

    total = 0

    for team_key in teams:

        file = (
            PROCESSED_TEAMS_DIR
            / team_key
            / "cumulative_box.csv"
        )

        df = read_csv_safe(
            file
        )

        if df is not None:
            total += len(
                df
            )

    return total


def validate_combined_pair(
    *,
    csv_filename,
    json_filename,
    expected_count,
    unique_columns=None,
):
    csv_file = (
        COMBINED_DIR
        / csv_filename
    )

    json_file = (
        COMBINED_DIR
        / json_filename
    )

    if not csv_file.exists():

        add_error(
            "COMBINED",
            "Combined CSV is missing.",
            file=csv_file,
        )

        return

    if not json_file.exists():

        add_error(
            "COMBINED",
            "Combined JSON is missing.",
            file=json_file,
        )

        return

    df = read_csv_safe(
        csv_file
    )

    json_data = read_json_safe(
        json_file
    )

    if (
        df is None
        or
        json_data is None
    ):
        return

    csv_count = len(
        df
    )

    json_count = (
        len(
            json_data
        )
        if isinstance(
            json_data,
            list,
        )
        else -1
    )

    if csv_count != expected_count:

        add_error(
            "COMBINED_ROW_COUNT",
            (
                f"{csv_filename} has "
                f"{csv_count} rows; "
                f"expected "
                f"{expected_count}."
            ),
            file=csv_file,
        )

    if json_count != csv_count:

        add_error(
            "COMBINED_ROW_COUNT",
            (
                f"Combined CSV/JSON count "
                f"mismatch: CSV={csv_count}, "
                f"JSON={json_count}."
            ),
            file=json_file,
        )

    if unique_columns:

        missing_columns = [
            column
            for column
            in unique_columns
            if column
            not in df.columns
        ]

        if missing_columns:

            add_error(
                "COMBINED",
                (
                    "Missing uniqueness columns: "
                    + ", ".join(
                        missing_columns
                    )
                ),
                file=csv_file,
            )

        else:

            duplicates = (
                df.duplicated(
                    subset=
                        unique_columns,
                    keep=False,
                )
            )

            if duplicates.any():

                add_error(
                    "COMBINED_DUPLICATE",
                    (
                        f"Duplicate rows found "
                        f"using key: "
                        f"{unique_columns}"
                    ),
                    file=csv_file,
                )

    validate_csv_no_internal_columns(
        df,
        file=csv_file,
    )

    scan_json_for_internal_data(
        json_data,
        file=json_file,
    )


def validate_combined(
    expected_players,
):
    print()
    print(
        "================================"
    )
    print(
        "VALIDATING COMBINED FILES"
    )
    print(
        "================================"
    )

    play_types_expected = (
        sum_player_file_rows(
            expected_players,
            section=
                "play_types",
        )
    )

    shot_types_expected = (
        sum_player_file_rows(
            expected_players,
            section=
                "shot_types",
        )
    )

    team_expected = (
        sum_team_file_rows(
            expected_players
        )
    )

    validate_combined_pair(
        csv_filename=
            "player_play_types.csv",

        json_filename=
            "player_play_types.json",

        expected_count=
            play_types_expected,

        unique_columns=[
            "PLAYER",
            "TEAM",
            "SIDE",
            "TABLE",
            "PATH",
        ],
    )

    validate_combined_pair(
        csv_filename=
            "player_shot_types.csv",

        json_filename=
            "player_shot_types.json",

        expected_count=
            shot_types_expected,

        unique_columns=[
            "PLAYER",
            "TEAM",
            "SIDE",
            "TABLE",
            "PATH",
        ],
    )

    validate_combined_pair(
        csv_filename=
            "team_cumulative_box.csv",

        json_filename=
            "team_cumulative_box.json",

        expected_count=
            team_expected,

        unique_columns=[
            "TEAM",
            "PLAYER",
        ],
    )


# ============================================================
# SAVE REPORT
# ============================================================

def save_validation_report():
    columns = [
        "SEVERITY",
        "CATEGORY",
        "PLAYER",
        "TEAM",
        "SECTION",
        "SIDE",
        "FILE",
        "MESSAGE",
    ]

    if issues:

        df = pd.DataFrame(
            issues
        )

        df = df[
            columns
        ]

    else:

        df = pd.DataFrame(
            columns=
                columns
        )

    VALIDATION_REPORT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    df.to_csv(
        VALIDATION_REPORT_FILE,
        index=False,
        encoding="utf-8-sig",
    )


# ============================================================
# MAIN
# ============================================================

def main():
    global issues

    issues = []

    print()
    print(
        "================================"
    )
    print(
        "VALIDATE SYNERGY OUTPUTS"
    )
    print(
        "================================"
    )

    expected_players = (
        load_expected_players()
    )

    print()
    print(
        f"Expected player/team rows: "
        f"{len(expected_players)}"
    )

    expected_team_count = len(
        {
            slugify(
                player[
                    "team_name"
                ]
            )
            for player
            in expected_players
        }
    )

    print(
        f"Expected teams: "
        f"{expected_team_count}"
    )

    validate_players(
        expected_players
    )

    validate_teams(
        expected_players
    )

    validate_combined(
        expected_players
    )

    save_validation_report()

    errors = [
        issue
        for issue
        in issues
        if issue[
            "SEVERITY"
        ]
        == "ERROR"
    ]

    warnings = [
        issue
        for issue
        in issues
        if issue[
            "SEVERITY"
        ]
        == "WARNING"
    ]

    print()
    print(
        "================================"
    )
    print(
        "VALIDATION SUMMARY"
    )
    print(
        "================================"
    )

    print()
    print(
        f"Errors: "
        f"{len(errors)}"
    )

    print(
        f"Warnings: "
        f"{len(warnings)}"
    )

    print()

    if errors:

        print(
            "RESULT: FAILED"
        )

        print()

        for issue in errors[
            :20
        ]:

            label_parts = []

            if issue.get(
                "PLAYER"
            ):
                label_parts.append(
                    issue[
                        "PLAYER"
                    ]
                )

            if issue.get(
                "TEAM"
            ):
                label_parts.append(
                    issue[
                        "TEAM"
                    ]
                )

            if issue.get(
                "SECTION"
            ):
                label_parts.append(
                    issue[
                        "SECTION"
                    ]
                )

            if issue.get(
                "SIDE"
            ):
                label_parts.append(
                    issue[
                        "SIDE"
                    ]
                )

            label = (
                " | ".join(
                    label_parts
                )
            )

            if label:
                label = (
                    f"{label}: "
                )

            print(
                f"ERROR [{issue['CATEGORY']}] "
                f"{label}"
                f"{issue['MESSAGE']}"
            )

        if len(
            errors
        ) > 20:

            print()
            print(
                f"... plus "
                f"{len(errors) - 20} "
                f"more errors."
            )

    else:

        print(
            "RESULT: PASSED"
        )

    print()
    print(
        "Validation report:"
    )

    print(
        VALIDATION_REPORT_FILE
    )

    print()

    # Non-zero exit code is useful later when run_pipeline.py
    # calls validation automatically.
    if errors:
        sys.exit(
            1
        )


if __name__ == "__main__":
    main()