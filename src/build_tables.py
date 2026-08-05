import re
from pathlib import Path

import pandas as pd

from config.settings import (
    RAW_PLAYERS_DIR,
    RAW_TEAMS_DIR,
    PROCESSED_PLAYERS_DIR,
    PROCESSED_TEAMS_DIR,
    COMBINED_DIR,
    SYNERGY_SEASON,
    PLAYER_DATA_SECTIONS,
    PLAYER_SIDES,
)

from src.utils import (
    ensure_directory,
    read_json,
)


# ============================================================
# CLEAN OUTPUT COLUMN ORDER
# ============================================================

PLAYER_BASE_COLUMNS = [
    "PLAYER",
    "TEAM",
    "SEASON",
    "SIDE",
    "TABLE",
    "STAT",
    "DEPTH",
    "PARENT",
    "PATH",
]

TEAM_BASE_COLUMNS = [
    "TEAM",
    "SEASON",
    "PLAYER",
]


# ============================================================
# GENERAL HELPERS
# ============================================================

def clean_text(value):
    if value is None:
        return ""

    return " ".join(
        str(value).split()
    )

def clean_stat_value(value):
    """
    Convert Synergy display values into analysis-friendly values.

    Examples:
        "52"       -> 52
        "0.788"    -> 0.788
        "24.5%"    -> 24.5
        "1,234"    -> 1234
        "-"        -> None
        ""         -> None
        "Very Good" -> "Very Good"

    Percentages stay on the Synergy 0-100 scale.

    Example:
        "42.9%" -> 42.9

    We are NOT converting 42.9% to 0.429.
    """

    if value is None:
        return None

    text = clean_text(
        value
    )

    if text in (
        "",
        "-",
        "—",
    ):
        return None

    # --------------------------------------------------------
    # Percentage
    # --------------------------------------------------------

    if text.endswith(
        "%"
    ):
        number_text = (
            text[:-1]
            .replace(
                ",",
                "",
            )
            .strip()
        )

        try:
            return float(
                number_text
            )

        except ValueError:
            return text

    # --------------------------------------------------------
    # Normal numeric value
    # --------------------------------------------------------

    number_text = (
        text.replace(
            ",",
            "",
        )
    )

    if re.fullmatch(
        r"[+-]?\d+",
        number_text,
    ):
        try:
            return int(
                number_text
            )

        except ValueError:
            pass

    if re.fullmatch(
        r"[+-]?(?:\d+\.\d*|\.\d+)",
        number_text,
    ):
        try:
            return float(
                number_text
            )

        except ValueError:
            pass

    # --------------------------------------------------------
    # Text values such as:
    #
    # Very Good
    # Excellent
    # Below Average
    # --------------------------------------------------------

    return text

def strip_jersey_number(player_name):
    """
    Synergy Cumulative Box names look like:

        #6 Quincy Guerrier
        #0 Kevin Osawe

    Clean output:

        Quincy Guerrier
        Kevin Osawe
    """

    value = clean_text(
        player_name
    )

    value = re.sub(
        r"^#\d+\s+",
        "",
        value,
    )

    return value.strip()


def load_json_if_exists(path):
    path = Path(path)

    if not path.exists():
        return None

    try:
        return read_json(
            path
        )

    except Exception as exc:
        print(
            f"WARNING: Could not read "
            f"{path}: {exc}"
        )

        return None


def write_records_csv(
    records,
    output_file,
    preferred_columns=None,
):
    """
    Write records while keeping a readable, stable column order.

    preferred_columns appear first.
    Any additional Synergy fields follow in first-seen order.
    """

    output_file = Path(
        output_file
    )

    ensure_directory(
        output_file.parent
    )

    if not records:

        pd.DataFrame().to_csv(
            output_file,
            index=False,
        )

        return 0

    all_columns = []

    for record in records:

        for column in record.keys():

            if column not in all_columns:
                all_columns.append(
                    column
                )

    ordered_columns = []

    if preferred_columns:

        for column in preferred_columns:

            if column in all_columns:
                ordered_columns.append(
                    column
                )

    for column in all_columns:

        if column not in ordered_columns:
            ordered_columns.append(
                column
            )

    df = pd.DataFrame(
        records
    )

    for column in ordered_columns:

        if column not in df.columns:
            df[column] = ""

    df = df[
        ordered_columns
    ]

    df.to_csv(
        output_file,
        index=False,
        encoding="utf-8-sig",
    )

    return len(df)


# ============================================================
# PLAYER TABLE HELPERS
# ============================================================

def get_max_depth(
    tables,
):
    max_depth = 1

    for table in tables or []:

        for row in table.get(
            "rows",
            [],
        ):

            try:
                depth = int(
                    row.get(
                        "depth",
                        1,
                    )
                )

            except (
                TypeError,
                ValueError,
            ):
                depth = 1

            max_depth = max(
                max_depth,
                depth,
            )

    return max_depth


def get_player_preferred_columns(
    max_depth,
):
    columns = list(
        PLAYER_BASE_COLUMNS
    )

    for level in range(
        1,
        max_depth + 1,
    ):
        columns.append(
            f"LEVEL_{level}"
        )

    return columns


def flatten_player_tables(
    *,
    tables,
    player_name,
    team_name,
    side,
):
    """
    Turn expanded_tables.json into flat clean rows.

    Removes:
        row_index
        cells
        API/internal IDs
        raw source expressions

    Keeps:
        readable hierarchy
        readable Synergy stat names
        every displayed metric
    """

    output = []

    for table in tables or []:

        table_name = clean_text(
            table.get(
                "table"
            )
        )

        rows = table.get(
            "rows",
            [],
        )

        for row in rows:

            stat = clean_text(
                row.get(
                    "stat"
                )
            )

            if not stat:
                continue

            try:
                depth = int(
                    row.get(
                        "depth",
                        1,
                    )
                )

            except (
                TypeError,
                ValueError,
            ):
                depth = 1

            record = {
                "PLAYER":
                    player_name,

                "TEAM":
                    team_name,

                "SEASON":
                    SYNERGY_SEASON,

                "SIDE":
                    side,

                "TABLE":
                    table_name,

                "STAT":
                    stat,

                "DEPTH":
                    depth,

                "PARENT":
                    clean_text(
                        row.get(
                            "parent"
                        )
                    ),

                "PATH":
                    clean_text(
                        row.get(
                            "path"
                        )
                    ),
            }

            # ------------------------------------------------
            # Dynamic hierarchy levels.
            #
            # No hard-coded max of 5 or 6.
            # ------------------------------------------------

            for level in range(
                1,
                depth + 1,
            ):

                value = row.get(
                    f"level_{level}",
                    "",
                )

                record[
                    f"LEVEL_{level}"
                ] = clean_text(
                    value
                )

            # ------------------------------------------------
            # All displayed Synergy metrics
            # ------------------------------------------------

            data = row.get(
                "data",
                {}
            )

            if isinstance(
                data,
                dict,
            ):

                for key, value in data.items():

                    clean_key = clean_text(
                        key
                    )

                    if not clean_key:
                        continue

                    # STAT already exists in our clean base.
                    if clean_key.upper() == "STAT":
                        continue

                    record[
                        clean_key
                    ] = clean_stat_value(
                        value
                    )

            output.append(
                record
            )

    return output


# ============================================================
# BUILD ONE PLAYER
# ============================================================

def build_player_tables(
    player_folder,
):
    player_folder = Path(
        player_folder
    )

    metadata_file = (
        player_folder
        / "metadata.json"
    )

    metadata = load_json_if_exists(
        metadata_file
    )

    if not metadata:
        print(
            f"  SKIP: Missing metadata "
            f"{player_folder.name}"
        )

        return {
            "play_types": [],
            "shot_types": [],
        }

    player_name = clean_text(
        metadata.get(
            "player_name"
        )
    )

    team_name = clean_text(
        metadata.get(
            "team_name"
        )
    )

    if not player_name:
        print(
            f"  SKIP: No player name "
            f"{player_folder.name}"
        )

        return {
            "play_types": [],
            "shot_types": [],
        }

    print()
    print(
        f"Player: {player_name}"
    )

    print(
        f"Team: {team_name}"
    )

    combined_by_section = {
        "play_types": [],
        "shot_types": [],
    }

    processed_player_folder = (
        PROCESSED_PLAYERS_DIR
        / player_folder.name
    )

    # ========================================================
    # PLAY TYPES + SHOT TYPES
    # ========================================================

    for section in (
        PLAYER_DATA_SECTIONS
    ):

        section_records = []

        for side in (
            PLAYER_SIDES
        ):

            source_file = (
                player_folder
                / section
                / side
                / "expanded_tables.json"
            )

            tables = load_json_if_exists(
                source_file
            )

            if not tables:

                print(
                    f"  Missing: "
                    f"{section} | {side}"
                )

                continue

            records = flatten_player_tables(
                tables=tables,
                player_name=player_name,
                team_name=team_name,
                side=side,
            )

            max_depth = get_max_depth(
                tables
            )

            preferred_columns = (
                get_player_preferred_columns(
                    max_depth
                )
            )

            output_file = (
                processed_player_folder
                / section
                / f"{side}.csv"
            )

            row_count = write_records_csv(
                records,
                output_file,
                preferred_columns=
                    preferred_columns,
            )

            print(
                f"  {section} "
                f"| {side}: "
                f"{row_count} rows"
            )

            section_records.extend(
                records
            )

            combined_by_section[
                section
            ].extend(
                records
            )

        # ----------------------------------------------------
        # Optional player-level combined offense + defense CSV
        # ----------------------------------------------------

        if section_records:

            max_depth = max(
                (
                    int(
                        row.get(
                            "DEPTH",
                            1,
                        )
                    )
                    for row
                    in section_records
                ),
                default=1,
            )

            output_file = (
                processed_player_folder
                / section
                / "all.csv"
            )

            write_records_csv(
                section_records,
                output_file,
                preferred_columns=
                    get_player_preferred_columns(
                        max_depth
                    ),
            )

    return combined_by_section


# ============================================================
# TEAM CUMULATIVE BOX
# ============================================================

def flatten_cumulative_box(
    *,
    tables,
    team_name,
):
    output = []

    for table in tables or []:

        rows = table.get(
            "rows",
            [],
        )

        for row in rows:

            data = row.get(
                "data",
                {}
            )

            if not isinstance(
                data,
                dict,
            ):
                continue

            raw_player = (
                data.get(
                    "PLAYER"
                )
            )

            player_name = (
                strip_jersey_number(
                    raw_player
                )
            )

            if not player_name:
                continue

            record = {
                "TEAM":
                    team_name,

                "SEASON":
                    SYNERGY_SEASON,

                "PLAYER":
                    player_name,
            }

            for key, value in data.items():

                clean_key = clean_text(
                    key
                )

                if not clean_key:
                    continue

                if clean_key.upper() == "PLAYER":
                    continue

                record[
                    clean_key
                ] = clean_stat_value(
                    value
                )

            output.append(
                record
            )

    return output


def build_team_cumulative_boxes():
    all_records = []

    ensure_directory(
        PROCESSED_TEAMS_DIR
    )

    if not RAW_TEAMS_DIR.exists():

        print()
        print(
            "No raw team folder found."
        )

        return all_records

    team_folders = sorted(
        [
            path
            for path
            in RAW_TEAMS_DIR.iterdir()
            if path.is_dir()
        ],
        key=lambda path:
            path.name,
    )

    print()
    print(
        "================================"
    )
    print(
        "TEAM CUMULATIVE BOX"
    )
    print(
        "================================"
    )

    for team_folder in team_folders:

        cumulative_folder = (
            team_folder
            / "cumulative_box"
        )

        source_file = (
            cumulative_folder
            / "cumulative_box_tables.json"
        )

        metadata_file = (
            cumulative_folder
            / "capture_metadata.json"
        )

        tables = load_json_if_exists(
            source_file
        )

        metadata = load_json_if_exists(
            metadata_file
        )

        if not tables:
            continue

        if metadata:

            team_name = clean_text(
                metadata.get(
                    "team"
                )
            )

        else:

            team_name = ""

        if not team_name:

            team_name = (
                team_folder.name
                .replace(
                    "_",
                    " ",
                )
                .title()
            )

        records = flatten_cumulative_box(
            tables=tables,
            team_name=team_name,
        )

        output_file = (
            PROCESSED_TEAMS_DIR
            / team_folder.name
            / "cumulative_box.csv"
        )

        row_count = write_records_csv(
            records,
            output_file,
            preferred_columns=
                TEAM_BASE_COLUMNS,
        )

        print(
            f"{team_name}: "
            f"{row_count} players"
        )

        all_records.extend(
            records
        )

    return all_records


# ============================================================
# PLAYER BUILD
# ============================================================

def build_all_player_tables():
    play_type_records = []
    shot_type_records = []

    ensure_directory(
        PROCESSED_PLAYERS_DIR
    )

    if not RAW_PLAYERS_DIR.exists():

        print(
            "No raw player folder found."
        )

        return (
            play_type_records,
            shot_type_records,
        )

    player_folders = sorted(
        [
            path
            for path
            in RAW_PLAYERS_DIR.iterdir()
            if path.is_dir()
        ],
        key=lambda path:
            path.name,
    )

    print()
    print(
        "================================"
    )
    print(
        "PLAYER TABLES"
    )
    print(
        "================================"
    )

    for player_folder in (
        player_folders
    ):

        result = build_player_tables(
            player_folder
        )

        play_type_records.extend(
            result.get(
                "play_types",
                [],
            )
        )

        shot_type_records.extend(
            result.get(
                "shot_types",
                [],
            )
        )

    return (
        play_type_records,
        shot_type_records,
    )


# ============================================================
# COMBINED LEAGUE FILES
# ============================================================

def build_combined_player_file(
    records,
    filename,
):
    if not records:
        return 0

    max_depth = max(
        (
            int(
                row.get(
                    "DEPTH",
                    1,
                )
            )
            for row
            in records
        ),
        default=1,
    )

    preferred_columns = (
        get_player_preferred_columns(
            max_depth
        )
    )

    output_file = (
        COMBINED_DIR
        / filename
    )

    return write_records_csv(
        records,
        output_file,
        preferred_columns=
            preferred_columns,
    )


def build_combined_team_file(
    records,
):
    if not records:
        return 0

    output_file = (
        COMBINED_DIR
        / "team_cumulative_box.csv"
    )

    return write_records_csv(
        records,
        output_file,
        preferred_columns=
            TEAM_BASE_COLUMNS,
    )


# ============================================================
# MAIN
# ============================================================

def main():
    print()
    print(
        "================================"
    )
    print(
        "BUILD CLEAN SYNERGY TABLES"
    )
    print(
        "================================"
    )

    ensure_directory(
        PROCESSED_PLAYERS_DIR
    )

    ensure_directory(
        PROCESSED_TEAMS_DIR
    )

    ensure_directory(
        COMBINED_DIR
    )

    # ========================================================
    # PLAYER FILES
    # ========================================================

    (
        play_type_records,
        shot_type_records,
    ) = build_all_player_tables()

    # ========================================================
    # TEAM FILES
    # ========================================================

    team_records = (
        build_team_cumulative_boxes()
    )

    # ========================================================
    # COMBINED FILES
    # ========================================================

    print()
    print(
        "================================"
    )
    print(
        "COMBINED FILES"
    )
    print(
        "================================"
    )

    play_type_count = (
        build_combined_player_file(
            play_type_records,
            "player_play_types.csv",
        )
    )

    print(
        f"player_play_types.csv: "
        f"{play_type_count} rows"
    )

    shot_type_count = (
        build_combined_player_file(
            shot_type_records,
            "player_shot_types.csv",
        )
    )

    print(
        f"player_shot_types.csv: "
        f"{shot_type_count} rows"
    )

    team_count = (
        build_combined_team_file(
            team_records
        )
    )

    print(
        f"team_cumulative_box.csv: "
        f"{team_count} rows"
    )

    # ========================================================
    # SUMMARY
    # ========================================================

    print()
    print(
        "================================"
    )
    print(
        "BUILD COMPLETE"
    )
    print(
        "================================"
    )

    print()

    print(
        "Processed players:"
    )

    print(
        PROCESSED_PLAYERS_DIR
    )

    print()

    print(
        "Processed teams:"
    )

    print(
        PROCESSED_TEAMS_DIR
    )

    print()

    print(
        "Combined files:"
    )

    print(
        COMBINED_DIR
    )


if __name__ == "__main__":
    main()