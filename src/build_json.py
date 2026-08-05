import json
import math
from pathlib import Path

import pandas as pd

from config.settings import (
    PROCESSED_PLAYERS_DIR,
    PROCESSED_TEAMS_DIR,
    COMBINED_DIR,
    SYNERGY_SEASON,
    SYNERGY_LEAGUE,
)

from src.utils import (
    ensure_directory,
)


# ============================================================
# JSON HELPERS
# ============================================================

def clean_json_value(value):
    """
    Convert pandas/numpy values into normal JSON-safe values.

    Examples:
        NaN -> None
        numpy int -> int
        numpy float -> float
    """

    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if hasattr(
        value,
        "item",
    ):
        try:
            value = value.item()
        except Exception:
            pass

    if isinstance(
        value,
        float,
    ):
        if math.isnan(value):
            return None

    return value


def dataframe_to_records(
    df,
):
    """
    Convert a dataframe into JSON-safe dictionaries.
    """

    records = []

    for raw_record in df.to_dict(
        orient="records"
    ):
        record = {}

        for key, value in raw_record.items():

            record[
                key
            ] = clean_json_value(
                value
            )

        records.append(
            record
        )

    return records


def write_json_file(
    data,
    output_file,
):
    output_file = Path(
        output_file
    )

    ensure_directory(
        output_file.parent
    )

    with output_file.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            data,
            file,
            indent=2,
            ensure_ascii=False,
            allow_nan=False,
        )


def read_csv_if_exists(
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

        print(
            f"WARNING: Could not read "
            f"{path}: {exc}"
        )

        return None


# ============================================================
# HIERARCHY HELPERS
# ============================================================

def is_hierarchy_column(
    column,
):
    """
    Columns used to construct the hierarchy itself.

    These are excluded from the node's stats dictionary.
    """

    if column in {
        "PLAYER",
        "TEAM",
        "SEASON",
        "SIDE",
        "TABLE",
        "STAT",
        "DEPTH",
        "PARENT",
        "PATH",
    }:
        return True

    if column.startswith(
        "LEVEL_"
    ):
        return True

    return False


def extract_stats(
    record,
):
    """
    Keep only actual Synergy stat columns.

    Example:

        {
            "POSS": 52,
            "%TIME": 24.5,
            "PTS": 41,
            "PPP": 0.788,
            ...
        }
    """

    stats = {}

    for key, value in record.items():

        if is_hierarchy_column(
            key
        ):
            continue

        stats[
            key
        ] = clean_json_value(
            value
        )

    return stats


def make_tree_node(
    record,
):
    """
    Build one expandable hierarchy node.
    """

    return {
        "stat":
            clean_json_value(
                record.get(
                    "STAT"
                )
            ),

        "depth":
            int(
                record.get(
                    "DEPTH",
                    1,
                )
            ),

        "parent":
            clean_json_value(
                record.get(
                    "PARENT"
                )
            ),

        "path":
            clean_json_value(
                record.get(
                    "PATH"
                )
            ),

        "stats":
            extract_stats(
                record
            ),

        "children":
            [],
    }


def build_table_tree(
    records,
):
    """
    Convert sequential flat hierarchy rows into nested JSON.

    Important:
    - no maximum hierarchy depth
    - hierarchy resets for each Synergy table
    - uses DEPTH + row order
    """

    roots = []

    stack = []

    for record in records:

        try:
            depth = int(
                record.get(
                    "DEPTH",
                    1,
                )
            )

        except (
            TypeError,
            ValueError,
        ):
            depth = 1

        if depth < 1:
            depth = 1

        node = make_tree_node(
            record
        )

        # ----------------------------------------------------
        # Root node
        # ----------------------------------------------------

        if depth == 1:

            roots.append(
                node
            )

            stack = [
                node
            ]

            continue

        # ----------------------------------------------------
        # Remove anything at this depth or deeper
        # ----------------------------------------------------

        while len(
            stack
        ) >= depth:

            stack.pop()

        # ----------------------------------------------------
        # Parent should now be the last stack item
        # ----------------------------------------------------

        if stack:

            parent_node = (
                stack[-1]
            )

            parent_node[
                "children"
            ].append(
                node
            )

        else:
            # Safety fallback:
            # if hierarchy is malformed, don't lose the row.
            roots.append(
                node
            )

        stack.append(
            node
        )

    return roots


def build_tree_json(
    df,
):
    """
    Create the complete nested player JSON.

    Each Synergy report table remains separate.

    Example:

        Play types
        Overall Drive Direction
        P&R ball handler
        Isolation
        Post up
    """

    if df is None:
        return None

    if df.empty:
        return None

    first_row = (
        df.iloc[0]
    )

    player_name = (
        clean_json_value(
            first_row.get(
                "PLAYER"
            )
        )
    )

    team_name = (
        clean_json_value(
            first_row.get(
                "TEAM"
            )
        )
    )

    side = (
        clean_json_value(
            first_row.get(
                "SIDE"
            )
        )
    )

    tables_output = []

    if "TABLE" not in df.columns:
        return None

    # --------------------------------------------------------
    # sort=False preserves the original Synergy table order
    # --------------------------------------------------------

    for table_name, table_df in df.groupby(
        "TABLE",
        sort=False,
        dropna=False,
    ):

        table_records = (
            dataframe_to_records(
                table_df
            )
        )

        roots = build_table_tree(
            table_records
        )

        tables_output.append(
            {
                "table":
                    clean_json_value(
                        table_name
                    ),

                "row_count":
                    len(
                        table_records
                    ),

                "rows":
                    roots,
            }
        )

    return {
        "player":
            player_name,

        "team":
            team_name,

        "season":
            SYNERGY_SEASON,

        "league":
            SYNERGY_LEAGUE,

        "side":
            side,

        "tables":
            tables_output,
    }


# ============================================================
# PLAYER JSON
# ============================================================

def build_player_metadata_json(
    player_folder,
):
    """
    Build a clean public player.json.

    No Synergy IDs.
    """

    candidate_files = [
        player_folder
        / "play_types"
        / "offense.csv",

        player_folder
        / "play_types"
        / "defense.csv",

        player_folder
        / "shot_types"
        / "offense.csv",

        player_folder
        / "shot_types"
        / "defense.csv",
    ]

    df = None

    for candidate in candidate_files:

        df = read_csv_if_exists(
            candidate
        )

        if (
            df is not None
            and
            not df.empty
        ):
            break

    if (
        df is None
        or
        df.empty
    ):
        return False

    first_row = (
        df.iloc[0]
    )

    output = {
        "player":
            clean_json_value(
                first_row.get(
                    "PLAYER"
                )
            ),

        "team":
            clean_json_value(
                first_row.get(
                    "TEAM"
                )
            ),

        "season":
            SYNERGY_SEASON,

        "league":
            SYNERGY_LEAGUE,
    }

    write_json_file(
        output,
        player_folder
        / "player.json",
    )

    return True


def build_player_section_json(
    player_folder,
    section,
    side,
):
    csv_file = (
        player_folder
        / section
        / f"{side}.csv"
    )

    df = read_csv_if_exists(
        csv_file
    )

    if (
        df is None
        or
        df.empty
    ):
        return {
            "flat_rows":
                0,

            "tree_tables":
                0,
        }

    # ========================================================
    # FLAT JSON
    # ========================================================

    flat_records = (
        dataframe_to_records(
            df
        )
    )

    flat_output_file = (
        player_folder
        / section
        / f"{side}.json"
    )

    write_json_file(
        flat_records,
        flat_output_file,
    )

    # ========================================================
    # TREE JSON
    # ========================================================

    tree_output = (
        build_tree_json(
            df
        )
    )

    tree_output_file = (
        player_folder
        / section
        / f"{side}_tree.json"
    )

    write_json_file(
        tree_output,
        tree_output_file,
    )

    return {
        "flat_rows":
            len(
                flat_records
            ),

        "tree_tables":
            len(
                tree_output.get(
                    "tables",
                    [],
                )
            )
            if tree_output
            else 0,
    }


def build_all_player_json():
    if not PROCESSED_PLAYERS_DIR.exists():

        print(
            "No processed player folder found."
        )

        return

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

    print()
    print(
        "================================"
    )
    print(
        "PLAYER JSON"
    )
    print(
        "================================"
    )

    for player_folder in (
        player_folders
    ):

        metadata_created = (
            build_player_metadata_json(
                player_folder
            )
        )

        if not metadata_created:

            print()
            print(
                f"Player folder skipped: "
                f"{player_folder.name}"
            )

            continue

        player_file = (
            player_folder
            / "player.json"
        )

        with player_file.open(
            "r",
            encoding="utf-8",
        ) as file:

            player_metadata = (
                json.load(
                    file
                )
            )

        print()
        print(
            f"Player: "
            f"{player_metadata.get('player')}"
        )

        print(
            f"Team: "
            f"{player_metadata.get('team')}"
        )

        for section in (
            "play_types",
            "shot_types",
        ):

            for side in (
                "offense",
                "defense",
            ):

                result = (
                    build_player_section_json(
                        player_folder,
                        section,
                        side,
                    )
                )

                print(
                    f"  {section} "
                    f"| {side}: "
                    f"{result['flat_rows']} rows "
                    f"| "
                    f"{result['tree_tables']} tables"
                )


# ============================================================
# TEAM CUMULATIVE BOX JSON
# ============================================================

def build_team_json():
    if not PROCESSED_TEAMS_DIR.exists():

        print()
        print(
            "No processed team folder found."
        )

        return

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

    print()
    print(
        "================================"
    )
    print(
        "TEAM JSON"
    )
    print(
        "================================"
    )

    for team_folder in (
        team_folders
    ):

        csv_file = (
            team_folder
            / "cumulative_box.csv"
        )

        df = read_csv_if_exists(
            csv_file
        )

        if (
            df is None
            or
            df.empty
        ):
            continue

        records = (
            dataframe_to_records(
                df
            )
        )

        output_file = (
            team_folder
            / "cumulative_box.json"
        )

        write_json_file(
            records,
            output_file,
        )

        team_name = (
            clean_json_value(
                df.iloc[0].get(
                    "TEAM"
                )
            )
        )

        print(
            f"{team_name}: "
            f"{len(records)} players"
        )


# ============================================================
# COMBINED JSON
# ============================================================

def build_combined_json_file(
    csv_filename,
    json_filename,
):
    csv_file = (
        COMBINED_DIR
        / csv_filename
    )

    df = read_csv_if_exists(
        csv_file
    )

    if (
        df is None
        or
        df.empty
    ):
        return 0

    records = (
        dataframe_to_records(
            df
        )
    )

    output_file = (
        COMBINED_DIR
        / json_filename
    )

    write_json_file(
        records,
        output_file,
    )

    return len(
        records
    )


def build_combined_json():
    print()
    print(
        "================================"
    )
    print(
        "COMBINED JSON"
    )
    print(
        "================================"
    )

    play_type_count = (
        build_combined_json_file(
            "player_play_types.csv",
            "player_play_types.json",
        )
    )

    print(
        f"player_play_types.json: "
        f"{play_type_count} rows"
    )

    shot_type_count = (
        build_combined_json_file(
            "player_shot_types.csv",
            "player_shot_types.json",
        )
    )

    print(
        f"player_shot_types.json: "
        f"{shot_type_count} rows"
    )

    team_count = (
        build_combined_json_file(
            "team_cumulative_box.csv",
            "team_cumulative_box.json",
        )
    )

    print(
        f"team_cumulative_box.json: "
        f"{team_count} rows"
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
        "BUILD CLEAN SYNERGY JSON"
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

    build_all_player_json()

    build_team_json()

    build_combined_json()

    print()
    print(
        "================================"
    )
    print(
        "JSON BUILD COMPLETE"
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