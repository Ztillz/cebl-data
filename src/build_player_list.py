import pandas as pd

from config.settings import (
    PLAYER_GAMES_FILE,
    PLAYERS_FILE,
)

from src.utils import (
    build_player_team_key,
)


def clean_name_part(value):
    if pd.isna(value):
        return ""

    return str(
        value
    ).strip()


def build_player_name(row):
    first_name = clean_name_part(
        row["first_name"]
    )

    family_name = clean_name_part(
        row["family_name"]
    )

    full_name = (
        f"{first_name} "
        f"{family_name}"
    ).strip()

    return " ".join(
        full_name.split()
    )


def build_player_list():
    if not PLAYER_GAMES_FILE.exists():
        raise FileNotFoundError(
            "Could not find:\n"
            f"{PLAYER_GAMES_FILE}"
        )

    print()
    print("==============================")
    print("BUILD CEBL PLAYER LIST")
    print("==============================")
    print()

    df = pd.read_csv(
        PLAYER_GAMES_FILE
    )

    required_columns = {
        "first_name",
        "family_name",
        "team_name",
    }

    missing = (
        required_columns
        - set(df.columns)
    )

    if missing:
        raise ValueError(
            "Missing required columns: "
            + ", ".join(
                sorted(
                    missing
                )
            )
        )

    # --------------------------------------------------------
    # Build full names
    # --------------------------------------------------------
    df["player_name"] = (
        df.apply(
            build_player_name,
            axis=1,
        )
    )

    players = (
        df[
            [
                "player_name",
                "team_name",
            ]
        ]
        .copy()
    )

    players["player_name"] = (
        players[
            "player_name"
        ]
        .astype(str)
        .str.strip()
    )

    players["team_name"] = (
        players[
            "team_name"
        ]
        .astype(str)
        .str.strip()
    )

    players = players[
        (
            players[
                "player_name"
            ]
            != ""
        )
        &
        (
            players[
                "team_name"
            ]
            != ""
        )
    ].copy()

    # --------------------------------------------------------
    # One row per player/team stint
    # --------------------------------------------------------
    players = (
        players
        .drop_duplicates(
            subset=[
                "player_name",
                "team_name",
            ]
        )
        .reset_index(
            drop=True
        )
    )

    # --------------------------------------------------------
    # Human-readable folder key
    # --------------------------------------------------------
    players[
        "player_team_key"
    ] = players.apply(
        lambda row:
            build_player_team_key(
                row[
                    "player_name"
                ],
                row[
                    "team_name"
                ],
            ),
        axis=1,
    )

    players = (
        players
        .sort_values(
            [
                "team_name",
                "player_name",
            ]
        )
        .reset_index(
            drop=True
        )
    )

    # --------------------------------------------------------
    # Save
    # --------------------------------------------------------
    PLAYERS_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    players.to_csv(
        PLAYERS_FILE,
        index=False,
    )

    print(
        f"Player/team rows: "
        f"{len(players)}"
    )

    print(
        f"Unique players: "
        f"{players['player_name'].nunique()}"
    )

    print(
        f"Teams: "
        f"{players['team_name'].nunique()}"
    )

    print()
    print(
        f"Saved:\n"
        f"{PLAYERS_FILE}"
    )

    print()
    print("==============================")
    print("PLAYERS BY TEAM")
    print("==============================")

    print(
        players
        .groupby(
            "team_name"
        )
        .size()
        .to_string()
    )

    return players


def main():
    build_player_list()


if __name__ == "__main__":
    main()