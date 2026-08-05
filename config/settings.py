from pathlib import Path


# ============================================================
# PROJECT
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

INPUT_DIR = PROJECT_ROOT / "input"
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

DOCS_DIR = PROJECT_ROOT / "docs"
DOCS_DATA_DIR = DOCS_DIR / "data"

REFERENCE_DIR = PROJECT_ROOT / "reference"
LOCAL_DIR = PROJECT_ROOT / ".local"


# ============================================================
# SEASON
# ============================================================

CEBL_YEAR = 2026

SYNERGY_SEASON = "2026-2027"

SYNERGY_SEASON_ID = (
    "69bba845d0611197290c7acc"
)

SYNERGY_LEAGUE = "International"

SYNERGY_LEAGUE_ID = (
    "54457dce300969b132fcfb3f"
)

SYNERGY_COMPETITION_KEY = (
    f"{SYNERGY_LEAGUE_ID}:ALL"
)


# ============================================================
# SYNERGY
# ============================================================

SYNERGY_HOME = (
    "https://apps.synergysports.com/basketball"
)

SYNERGY_API_BASE = (
    "https://basketball.synergysportstech.com/api"
)

BROWSER_PROFILE = (
    LOCAL_DIR
    / "synergy_browser_profile"
)


# ============================================================
# INPUT FILES
# ============================================================

PLAYER_GAMES_FILE = (
    INPUT_DIR
    / "player_games_2026.csv"
)

PLAYERS_FILE = (
    INPUT_DIR
    / "players.csv"
)


# ============================================================
# RAW DATA
# ============================================================

RAW_SEASON_DIR = (
    RAW_DATA_DIR
    / SYNERGY_SEASON
)

RAW_PLAYERS_DIR = (
    RAW_SEASON_DIR
    / "players"
)

RAW_TEAMS_DIR = (
    RAW_SEASON_DIR
    / "teams"
)


# ============================================================
# PROCESSED DATA
# ============================================================

PROCESSED_SEASON_DIR = (
    PROCESSED_DATA_DIR
    / SYNERGY_SEASON
)

PROCESSED_PLAYERS_DIR = (
    PROCESSED_SEASON_DIR
    / "players"
)

PROCESSED_TEAMS_DIR = (
    PROCESSED_SEASON_DIR
    / "teams"
)

COMBINED_DIR = (
    PROCESSED_SEASON_DIR
    / "combined"
)


# ============================================================
# MATCH / VALIDATION OUTPUTS
# ============================================================

MATCH_REPORT_FILE = (
    PROCESSED_SEASON_DIR
    / "synergy_player_matches.csv"
)

FAILED_MATCH_REPORT_FILE = (
    PROCESSED_SEASON_DIR
    / "synergy_failed_matches.csv"
)

CAPTURE_AUDIT_FILE = (
    PROCESSED_SEASON_DIR
    / "capture_audit.csv"
)

API_MANIFEST_FILE = (
    PROCESSED_SEASON_DIR
    / "api_capture_manifest.csv"
)


# ============================================================
# PLAYER DATA FAMILIES
# ============================================================

PLAYER_DATA_SECTIONS = {
    "play_types": {
        "label": "Play Types",
    },

    "shot_types": {
        "label": "Shot Types",
    },
}

PLAYER_SIDES = (
    "offense",
    "defense",
)


# ============================================================
# HIERARCHY CAPTURE
# ============================================================

HIERARCHY_MAX_PASSES = 25

HIERARCHY_CLICK_WAIT_MS = 350

PAGE_LOAD_WAIT_MS = 4500