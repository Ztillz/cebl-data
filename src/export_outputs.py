import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from config.settings import (
    DOCS_DATA_DIR,
    PROCESSED_PLAYERS_DIR,
    PROCESSED_TEAMS_DIR,
    COMBINED_DIR,
    SYNERGY_SEASON,
    SYNERGY_LEAGUE,
)

from src.utils import (
    ensure_directory,
    read_json,
    write_json,
)


# ============================================================
# OUTPUT LOCATION
# ============================================================

PUBLISH_ROOT = (
    DOCS_DATA_DIR
    / "synergy"
    / SYNERGY_SEASON
)

PUBLISH_PLAYERS_DIR = (
    PUBLISH_ROOT
    / "players"
)

PUBLISH_TEAMS_DIR = (
    PUBLISH_ROOT
    / "teams"
)

PUBLISH_COMBINED_DIR = (
    PUBLISH_ROOT
    / "combined"
)

MANIFEST_FILE = (
    PUBLISH_ROOT
    / "manifest.json"
)


# ============================================================
# FILES WE ACTUALLY WANT TO PUBLISH
# ============================================================

COMBINED_FILES = [
    "player_play_types.csv",
    "player_shot_types.csv",
    "player_shot_types.json",
    "team_cumulative_box.csv",
    "team_cumulative_box.json",
]


PLAYER_SECTION_FILES = [
    "offense.csv",
    "offense.json",
    "offense_tree.json",
    "defense.csv",
    "defense.json",
    "defense_tree.json",
]


TEAM_FILES = [
    "cumulative_box.csv",
    "cumulative_box.json",
]


# ============================================================
# HELPERS
# ============================================================

def copy_required_file(
    source,
    destination,
):
    source = Path(
        source
    )

    destination = Path(
        destination
    )

    if not source.exists():
        raise FileNotFoundError(
            f"Required publish file missing: {source}"
        )

    ensure_directory(
        destination.parent
    )

    shutil.copy2(
        source,
        destination,
    )


def reset_publish_folder():
    """
    Remove only the generated Synergy season folder.

    This prevents stale players/teams from surviving when
    rebuilding the published data.

    It does NOT touch other docs/data files.
    """

    if PUBLISH_ROOT.exists():

        shutil.rmtree(
            PUBLISH_ROOT
        )

    ensure_directory(
        PUBLISH_PLAYERS_DIR
    )

    ensure_directory(
        PUBLISH_TEAMS_DIR
    )

    ensure_directory(
        PUBLISH_COMBINED_DIR
    )


# ============================================================
# COMBINED FILES
# ============================================================

def publish_combined_files():
    print()
    print(
        "================================"
    )
    print(
        "PUBLISH COMBINED FILES"
    )
    print(
        "================================"
    )

    published = {}

    for filename in COMBINED_FILES:

        source = (
            COMBINED_DIR
            / filename
        )

        destination = (
            PUBLISH_COMBINED_DIR
            / filename
        )

        copy_required_file(
            source,
            destination,
        )

        published[
            filename
        ] = (
            f"combined/{filename}"
        )

        print(
            f"  {filename}"
        )

    return published


# ============================================================
# PLAYER FILES
# ============================================================

def publish_players():
    print()
    print(
        "================================"
    )
    print(
        "PUBLISH PLAYER FILES"
    )
    print(
        "================================"
    )

    players = []

    if not PROCESSED_PLAYERS_DIR.exists():

        raise FileNotFoundError(
            f"Processed player directory missing: "
            f"{PROCESSED_PLAYERS_DIR}"
        )

    player_folders = sorted(
        [
            path
            for path
            in PROCESSED_PLAYERS_DIR.iterdir()
            if path.is_dir()
        ],
        key=lambda path:
            path.name,
    )

    for player_folder in player_folders:

        player_json_file = (
            player_folder
            / "player.json"
        )

        if not player_json_file.exists():
            raise FileNotFoundError(
                f"Missing player.json: "
                f"{player_json_file}"
            )

        player_data = read_json(
            player_json_file
        )

        player_name = (
            player_data.get(
                "player",
                ""
            )
        )

        team_name = (
            player_data.get(
                "team",
                ""
            )
        )

        player_key = (
            player_folder.name
        )

        destination_root = (
            PUBLISH_PLAYERS_DIR
            / player_key
        )

        # ----------------------------------------------------
        # player.json
        # ----------------------------------------------------

        copy_required_file(
            player_json_file,
            destination_root
            / "player.json",
        )

        # ----------------------------------------------------
        # Play Types + Shot Types
        # ----------------------------------------------------

        for section in (
            "play_types",
            "shot_types",
        ):

            source_section = (
                player_folder
                / section
            )

            destination_section = (
                destination_root
                / section
            )

            for filename in (
                PLAYER_SECTION_FILES
            ):

                copy_required_file(
                    source_section
                    / filename,

                    destination_section
                    / filename,
                )

        players.append(
            {
                "player":
                    player_name,

                "team":
                    team_name,

                "key":
                    player_key,

                "path":
                    (
                        f"players/"
                        f"{player_key}/"
                    ),

                "player_json":
                    (
                        f"players/"
                        f"{player_key}/"
                        f"player.json"
                    ),

                "play_types":
                    {
                        "offense":
                            (
                                f"players/"
                                f"{player_key}/"
                                f"play_types/"
                                f"offense.json"
                            ),

                        "offense_tree":
                            (
                                f"players/"
                                f"{player_key}/"
                                f"play_types/"
                                f"offense_tree.json"
                            ),

                        "defense":
                            (
                                f"players/"
                                f"{player_key}/"
                                f"play_types/"
                                f"defense.json"
                            ),

                        "defense_tree":
                            (
                                f"players/"
                                f"{player_key}/"
                                f"play_types/"
                                f"defense_tree.json"
                            ),
                    },

                "shot_types":
                    {
                        "offense":
                            (
                                f"players/"
                                f"{player_key}/"
                                f"shot_types/"
                                f"offense.json"
                            ),

                        "offense_tree":
                            (
                                f"players/"
                                f"{player_key}/"
                                f"shot_types/"
                                f"offense_tree.json"
                            ),

                        "defense":
                            (
                                f"players/"
                                f"{player_key}/"
                                f"shot_types/"
                                f"defense.json"
                            ),

                        "defense_tree":
                            (
                                f"players/"
                                f"{player_key}/"
                                f"shot_types/"
                                f"defense_tree.json"
                            ),
                    },
            }
        )

        print(
            f"  {player_name} | "
            f"{team_name}"
        )

    return players


# ============================================================
# TEAM FILES
# ============================================================

def publish_teams():
    print()
    print(
        "================================"
    )
    print(
        "PUBLISH TEAM FILES"
    )
    print(
        "================================"
    )

    teams = []

    if not PROCESSED_TEAMS_DIR.exists():

        raise FileNotFoundError(
            f"Processed team directory missing: "
            f"{PROCESSED_TEAMS_DIR}"
        )

    team_folders = sorted(
        [
            path
            for path
            in PROCESSED_TEAMS_DIR.iterdir()
            if path.is_dir()
        ],
        key=lambda path:
            path.name,
    )

    for team_folder in team_folders:

        team_key = (
            team_folder.name
        )

        cumulative_json_file = (
            team_folder
            / "cumulative_box.json"
        )

        cumulative_data = read_json(
            cumulative_json_file
        )

        if (
            not isinstance(
                cumulative_data,
                list,
            )
            or
            not cumulative_data
        ):

            raise ValueError(
                f"Empty cumulative box: "
                f"{cumulative_json_file}"
            )

        team_name = (
            cumulative_data[0]
            .get(
                "TEAM",
                ""
            )
        )

        destination_root = (
            PUBLISH_TEAMS_DIR
            / team_key
        )

        for filename in TEAM_FILES:

            copy_required_file(
                team_folder
                / filename,

                destination_root
                / filename,
            )

        teams.append(
            {
                "team":
                    team_name,

                "key":
                    team_key,

                "path":
                    (
                        f"teams/"
                        f"{team_key}/"
                    ),

                "cumulative_box":
                    (
                        f"teams/"
                        f"{team_key}/"
                        f"cumulative_box.json"
                    ),
            }
        )

        print(
            f"  {team_name}"
        )

    return teams


# ============================================================
# MANIFEST
# ============================================================

def build_manifest(
    *,
    players,
    teams,
    combined,
):
    generated_at = (
        datetime.now(
            timezone.utc
        )
        .replace(
            microsecond=0
        )
        .isoformat()
    )

    manifest = {
        "season":
            SYNERGY_SEASON,

        "league":
            SYNERGY_LEAGUE,

        "generated_at_utc":
            generated_at,

        "player_count":
            len(
                players
            ),

        "team_count":
            len(
                teams
            ),

        "combined":
            combined,

        "players":
            players,

        "teams":
            teams,
    }

    write_json(
        manifest,
        MANIFEST_FILE,
    )

    return manifest


# ============================================================
# MAIN
# ============================================================

def main():
    print()
    print(
        "================================"
    )
    print(
        "PUBLISH SYNERGY DATA"
    )
    print(
        "================================"
    )

    print()
    print(
        f"Season: "
        f"{SYNERGY_SEASON}"
    )

    print(
        f"Destination:"
    )

    print(
        PUBLISH_ROOT
    )

    # ========================================================
    # CLEAN OLD PUBLISHED SEASON DATA
    # ========================================================

    reset_publish_folder()

    # ========================================================
    # COPY CLEAN OUTPUTS
    # ========================================================

    combined = (
        publish_combined_files()
    )

    players = (
        publish_players()
    )

    teams = (
        publish_teams()
    )

    # ========================================================
    # MANIFEST
    # ========================================================

    manifest = (
        build_manifest(
            players=players,
            teams=teams,
            combined=combined,
        )
    )

    # ========================================================
    # SUMMARY
    # ========================================================

    print()
    print(
        "================================"
    )
    print(
        "PUBLISH COMPLETE"
    )
    print(
        "================================"
    )

    print()
    print(
        f"Players published: "
        f"{manifest['player_count']}"
    )

    print(
        f"Teams published: "
        f"{manifest['team_count']}"
    )

    print()
    print(
        "Manifest:"
    )

    print(
        MANIFEST_FILE
    )

    print()
    print(
        "Published data:"
    )

    print(
        PUBLISH_ROOT
    )


if __name__ == "__main__":
    main()