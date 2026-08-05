import argparse
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(
    __file__
).resolve().parent


# ============================================================
# COMMAND RUNNER
# ============================================================

def run_command(
    module_name,
):
    """
    Run one project module in a separate Python process.

    If any step fails, stop the entire pipeline immediately.
    """

    command = [
        sys.executable,
        "-m",
        module_name,
    ]

    print()
    print(
        "================================"
    )
    print(
        f"RUNNING: {module_name}"
    )
    print(
        "================================"
    )
    print()

    result = subprocess.run(
        command,
        cwd=PROJECT_ROOT,
    )

    if result.returncode != 0:

        print()
        print(
            "================================"
        )
        print(
            "PIPELINE FAILED"
        )
        print(
            "================================"
        )

        print()
        print(
            f"Failed step: "
            f"{module_name}"
        )

        print(
            f"Exit code: "
            f"{result.returncode}"
        )

        sys.exit(
            result.returncode
        )


# ============================================================
# PIPELINE
# ============================================================

def run_pipeline(
    *,
    build_player_list=False,
    capture=False,
    publish=True,
):
    print()
    print(
        "================================"
    )
    print(
        "CEBL SYNERGY DATA PIPELINE"
    )
    print(
        "================================"
    )

    # ========================================================
    # OPTIONAL PLAYER LIST REBUILD
    # ========================================================

    if build_player_list:

        run_command(
            "src.build_player_list"
        )

    else:

        print()
        print(
            "Player-list rebuild skipped."
        )

        print(
            "Using existing input/players.csv."
        )

    # ========================================================
    # OPTIONAL SYNERGY CAPTURE
    # ========================================================

    if capture:

        run_command(
            "src.capture_synergy"
        )

    else:

        print()
        print(
            "Synergy capture skipped."
        )

        print(
            "Using existing raw data."
        )

    # ========================================================
    # CLEAN CSV TABLES
    # ========================================================

    run_command(
        "src.build_tables"
    )

    # ========================================================
    # JSON + TREE JSON
    # ========================================================

    run_command(
        "src.build_json"
    )

    # ========================================================
    # VALIDATION
    #
    # Publishing only happens if validation passes.
    # ========================================================

    run_command(
        "src.validate_outputs"
    )

    # ========================================================
    # PUBLISH CLEAN FILES
    # ========================================================

    if publish:

        run_command(
            "src.export_outputs"
        )

    else:

        print()
        print(
            "Publishing skipped."
        )

    # ========================================================
    # COMPLETE
    # ========================================================

    print()
    print(
        "================================"
    )
    print(
        "PIPELINE COMPLETE"
    )
    print(
        "================================"
    )

    print()

    if build_player_list:

        print(
            "Player list: REBUILT"
        )

    else:

        print(
            "Player list: EXISTING"
        )

    if capture:

        print(
            "Synergy capture: COMPLETE"
        )

    else:

        print(
            "Synergy capture: SKIPPED"
        )

    print(
        "CSV build: PASSED"
    )

    print(
        "JSON build: PASSED"
    )

    print(
        "Validation: PASSED"
    )

    if publish:

        print(
            "Publish: COMPLETE"
        )

    else:

        print(
            "Publish: SKIPPED"
        )


# ============================================================
# CLI
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Run the CEBL Synergy data pipeline."
        )
    )

    parser.add_argument(
        "--build-player-list",
        action="store_true",
        help=(
            "Rebuild input/players.csv from "
            "input/player_games_2026.csv before capture."
        ),
    )

    parser.add_argument(
        "--capture",
        action="store_true",
        help=(
            "Capture fresh Synergy data before "
            "building processed outputs."
        ),
    )

    parser.add_argument(
        "--no-publish",
        action="store_true",
        help=(
            "Build and validate data without "
            "copying outputs into docs/data."
        ),
    )

    return parser.parse_args()


# ============================================================
# MAIN
# ============================================================

def main():
    args = parse_args()

    run_pipeline(
        build_player_list=
            args.build_player_list,

        capture=
            args.capture,

        publish=
            not args.no_publish,
    )


if __name__ == "__main__":
    main()