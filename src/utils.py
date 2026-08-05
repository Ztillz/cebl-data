import json
import re
import unicodedata
from pathlib import Path


def normalize_text(value):
    """
    Normalize text for matching.

    Example:
        Montréal Alliance
        Montreal Alliance

    both normalize to:
        montreal alliance
    """

    if value is None:
        return ""

    value = str(value)

    value = unicodedata.normalize(
        "NFKD",
        value,
    )

    value = "".join(
        char
        for char in value
        if not unicodedata.combining(char)
    )

    value = value.lower()

    value = re.sub(
        r"[^a-z0-9]+",
        " ",
        value,
    )

    return " ".join(
        value.split()
    )


def slugify(value):
    """
    Make a clean folder/file-safe string.

    Example:
        Montréal Alliance
            ->
        montreal_alliance
    """

    value = normalize_text(
        value
    )

    value = value.replace(
        " ",
        "_",
    )

    value = re.sub(
        r"_+",
        "_",
        value,
    )

    return value.strip(
        "_"
    )


def build_player_team_key(
    player_name,
    team_name,
):
    """
    Human-readable unique folder key.

    Example:
        Kevin Osawe
        Montreal Alliance

    becomes:
        kevin_osawe__montreal_alliance
    """

    player_slug = slugify(
        player_name
    )

    team_slug = slugify(
        team_name
    )

    return (
        f"{player_slug}"
        f"__"
        f"{team_slug}"
    )


def ensure_directory(path):
    path = Path(
        path
    )

    path.mkdir(
        parents=True,
        exist_ok=True,
    )

    return path


def read_json(path):
    path = Path(
        path
    )

    with path.open(
        "r",
        encoding="utf-8",
    ) as file:
        return json.load(
            file
        )


def write_json(
    data,
    path,
    indent=2,
):
    path = Path(
        path
    )

    ensure_directory(
        path.parent
    )

    with path.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            data,
            file,
            indent=indent,
            ensure_ascii=False,
        )


def safe_float(value):
    if value in (
        None,
        "",
    ):
        return None

    try:
        return float(
            value
        )

    except (
        TypeError,
        ValueError,
    ):
        return None


def safe_int(value):
    if value in (
        None,
        "",
    ):
        return None

    try:
        return int(
            value
        )

    except (
        TypeError,
        ValueError,
    ):
        return None