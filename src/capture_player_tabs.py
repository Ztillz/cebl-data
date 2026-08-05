import re

from config.settings import (
    PLAYER_DATA_SECTIONS,
    HIERARCHY_MAX_PASSES,
    HIERARCHY_CLICK_WAIT_MS,
    PAGE_LOAD_WAIT_MS,
)

from src.utils import (
    ensure_directory,
    write_json,
)


# ============================================================
# PLAYER SECTION ROUTES
# ============================================================

PLAYER_SECTION_ROUTES = {
    "play_types": "playtypes",
    "shot_types": "shottypes",
}


# ============================================================
# URLS
# ============================================================

def build_player_url(
    player_id,
    season_id,
    route,
):
    return (
        "https://apps.synergysports.com/"
        f"basketball/players/{player_id}/"
        f"{route}?seasonId={season_id}"
    )


# ============================================================
# PAGE NAVIGATION
# ============================================================

def open_player_section(
    page,
    player_id,
    season_id,
    section,
):
    if section not in PLAYER_SECTION_ROUTES:
        raise ValueError(
            f"Unknown player section: {section}"
        )

    route = PLAYER_SECTION_ROUTES[
        section
    ]

    url = build_player_url(
        player_id,
        season_id,
        route,
    )

    page.goto(
        url,
        wait_until="domcontentloaded",
    )

    page.wait_for_timeout(
        PAGE_LOAD_WAIT_MS
    )


# ============================================================
# OFFENSE / DEFENSE
# ============================================================

def switch_side(
    page,
    side,
):
    if side not in {
        "offense",
        "defense",
    }:
        raise ValueError(
            f"Unknown side: {side}"
        )

    # Pages open on offense by default.
    if side == "offense":
        return

    # --------------------------------------------------------
    # First try the actual Offense/Defense pill buttons.
    # --------------------------------------------------------
    buttons = page.locator(
        "button"
    )

    try:
        count = buttons.count()
    except Exception:
        count = 0

    for index in range(
        count
    ):
        button = buttons.nth(
            index
        )

        try:
            if not button.is_visible():
                continue

            text = " ".join(
                button.inner_text()
                .split()
            )

            if text.lower() != "defense":
                continue

            button.click()

            page.wait_for_timeout(
                PAGE_LOAD_WAIT_MS
            )

            return

        except Exception:
            continue

    # --------------------------------------------------------
    # Fallback
    # --------------------------------------------------------
    try:
        defense = (
            page.get_by_text(
                "Defense",
                exact=True,
            )
            .first
        )

        defense.click()

        page.wait_for_timeout(
            PAGE_LOAD_WAIT_MS
        )

        return

    except Exception:
        pass

    raise RuntimeError(
        "Could not switch to Defense"
    )


# ============================================================
# HIERARCHY EXPANSION
# ============================================================

def expand_one_hierarchy_pass(
    page,
):
    """
    Expand every statistical row currently showing Synergy's
    right-facing caret.

    Synergy hierarchy rows look like:

        td.table-detail-row-label
            div.flex.select-none.items-center
                span.las.la-caret-right

    Clicking all currently available rows at once gives us
    breadth-first expansion:

        pass 1 -> depth 1
        pass 2 -> depth 2
        pass 3 -> depth 3
        ...

    Newly revealed children are handled on the next pass.
    """

    return page.evaluate(
        """
        () => {
            const normalize = (value) => {
                return (value || "")
                    .replace(/\\s+/g, " ")
                    .trim();
            };

            const icons = Array.from(
                document.querySelectorAll(
                    "td.table-detail-row-label span.la-caret-right"
                )
            );

            const clicked = [];

            for (const icon of icons) {
                const cell = icon.closest(
                    "td.table-detail-row-label"
                );

                if (!cell) {
                    continue;
                }

                const row = cell.closest(
                    "tr"
                );

                if (!row) {
                    continue;
                }

                const style =
                    window.getComputedStyle(row);

                if (
                    style.display === "none"
                    ||
                    style.visibility === "hidden"
                ) {
                    continue;
                }

                const clickable =
                    cell.querySelector(
                        "div.flex.select-none.items-center"
                    )
                    ||
                    cell.firstElementChild;

                if (!clickable) {
                    continue;
                }

                const label =
                    normalize(
                        cell.innerText
                    );

                const tableComponent =
                    cell.closest(
                        "ts-possession-report-boxscore-table"
                    );

                const tableName =
                    tableComponent
                        ?.getAttribute(
                            "tsprintid"
                        )
                    ||
                    tableComponent
                        ?.getAttribute(
                            "print-id"
                        )
                    ||
                    "Unknown Table";

                clickable.click();

                clicked.push({
                    table:
                        tableName,

                    label:
                        label,
                });
            }

            return clicked;
        }
        """
    )


def count_collapsed_hierarchy_rows(
    page,
):
    return page.evaluate(
        """
        () => {
            return document.querySelectorAll(
                "td.table-detail-row-label span.la-caret-right"
            ).length;
        }
        """
    )


def expand_all_hierarchy_rows(
    page,
):
    """
    Keep expanding statistical table rows until no right-facing
    Synergy carets remain or HIERARCHY_MAX_PASSES is reached.
    """

    total_clicks = 0
    pass_details = []

    for pass_number in range(
        1,
        HIERARCHY_MAX_PASSES + 1,
    ):
        collapsed_before = (
            count_collapsed_hierarchy_rows(
                page
            )
        )

        if collapsed_before == 0:
            pass_details.append(
                {
                    "pass":
                        pass_number,

                    "collapsed_rows_found":
                        0,

                    "rows_clicked":
                        0,

                    "clicked_rows":
                        [],
                }
            )

            print(
                f"      Hierarchy pass "
                f"{pass_number}: "
                f"0 expanded"
            )

            break

        clicked_rows = (
            expand_one_hierarchy_pass(
                page
            )
        )

        clicked_count = len(
            clicked_rows
        )

        total_clicks += (
            clicked_count
        )

        pass_details.append(
            {
                "pass":
                    pass_number,

                "collapsed_rows_found":
                    collapsed_before,

                "rows_clicked":
                    clicked_count,

                "clicked_rows":
                    clicked_rows,
            }
        )

        print(
            f"      Hierarchy pass "
            f"{pass_number}: "
            f"{clicked_count} expanded"
        )

        if clicked_count == 0:
            break

        # One wait for the whole breadth-first pass.
        # Much faster than waiting after every row.
        page.wait_for_timeout(
            max(
                HIERARCHY_CLICK_WAIT_MS,
                500,
            )
        )

    remaining = (
        count_collapsed_hierarchy_rows(
            page
        )
    )

    return {
        "total_expansion_clicks":
            total_clicks,

        "remaining_collapsed_rows":
            remaining,

        "passes":
            pass_details,
    }


# ============================================================
# CLEAN TABLE EXTRACTION
# ============================================================

def extract_expanded_tables(
    page,
):
    """
    Read every Synergy possession-report table after expansion.

    This is intentionally HUMAN-READABLE data.

    We save:
        table
        stat
        depth
        parent
        path
        level_1...
        displayed stats

    We do NOT expose:
        Synergy play IDs
        source_idd
        internal expressions
        API tags
    """

    return page.evaluate(
        """
        () => {
            const clean = (value) => {
                return (value || "")
                    .replace(/\\s+/g, " ")
                    .trim();
            };

            const parseDepth = (statCell) => {
                if (!statCell) {
                    return 1;
                }

                const firstWrapper =
                    statCell.querySelector(
                        ":scope > div"
                    );

                if (!firstWrapper) {
                    return 1;
                }

                const indentBox =
                    firstWrapper
                        .querySelector(
                            ":scope > div:first-child"
                        );

                if (!indentBox) {
                    return 1;
                }

                const minWidthText =
                    indentBox.style.minWidth
                    ||
                    window
                        .getComputedStyle(
                            indentBox
                        )
                        .minWidth
                    ||
                    "";

                const match =
                    minWidthText.match(
                        /([0-9.]+)px/
                    );

                if (!match) {
                    return 1;
                }

                const width =
                    Number(
                        match[1]
                    );

                /*
                Synergy hierarchy indentation:

                    depth 1 = 20px
                    depth 2 = 36px
                    depth 3 = 52px
                    depth 4 = 68px
                    depth 5 = 84px

                16px per level.
                */

                const depth =
                    Math.round(
                        (
                            width
                            - 20
                        )
                        / 16
                    )
                    + 1;

                return Math.max(
                    1,
                    depth
                );
            };

            const components =
                Array.from(
                    document.querySelectorAll(
                        "ts-possession-report-boxscore-table"
                    )
                );

            const output = [];

            for (
                let tableIndex = 0;
                tableIndex
                    < components.length;
                tableIndex++
            ) {
                const component =
                    components[
                        tableIndex
                    ];

                const tableName =
                    component.getAttribute(
                        "tsprintid"
                    )
                    ||
                    component.getAttribute(
                        "print-id"
                    )
                    ||
                    `Table ${tableIndex + 1}`;

                const table =
                    component.querySelector(
                        "table"
                    );

                if (!table) {
                    continue;
                }

                const headers =
                    Array.from(
                        table.querySelectorAll(
                            "thead th"
                        )
                    )
                    .map(
                        cell =>
                            clean(
                                cell.innerText
                            )
                    );

                const bodyRows =
                    Array.from(
                        table.querySelectorAll(
                            "tbody tr"
                        )
                    );

                const rows = [];

                const hierarchyStack = [];

                for (
                    let rowIndex = 0;
                    rowIndex
                        < bodyRows.length;
                    rowIndex++
                ) {
                    const row =
                        bodyRows[
                            rowIndex
                        ];

                    const cells =
                        Array.from(
                            row.querySelectorAll(
                                ":scope > td"
                            )
                        );

                    if (!cells.length) {
                        continue;
                    }

                    const values =
                        cells.map(
                            cell =>
                                clean(
                                    cell.innerText
                                )
                        );

                    const statCell =
                        cells.find(
                            cell =>
                                cell.classList
                                    .contains(
                                        "cdk-column-stat"
                                    )
                        )
                        ||
                        cells[0];

                    const stat =
                        clean(
                            statCell.innerText
                        );

                    if (!stat) {
                        continue;
                    }

                    let depth =
                        parseDepth(
                            statCell
                        );

                    /*
                    Some non-hierarchical Synergy tables do
                    not use indentation. Those remain depth 1.
                    */

                    depth = Math.max(
                        1,
                        depth
                    );

                    hierarchyStack[
                        depth - 1
                    ] = stat;

                    hierarchyStack.length =
                        depth;

                    const path =
                        hierarchyStack
                            .slice(
                                0,
                                depth
                            )
                            .join(
                                " > "
                            );

                    const parent =
                        depth > 1
                            ? hierarchyStack[
                                depth - 2
                            ]
                            : null;

                    const data = {};

                    for (
                        let cellIndex = 0;
                        cellIndex
                            < values.length;
                        cellIndex++
                    ) {
                        let header =
                            headers[
                                cellIndex
                            ]
                            ||
                            `column_${
                                cellIndex + 1
                            }`;

                        if (
                            Object.prototype
                                .hasOwnProperty
                                .call(
                                    data,
                                    header
                                )
                        ) {
                            header =
                                `${header}_${
                                    cellIndex + 1
                                }`;
                        }

                        data[
                            header
                        ] = values[
                            cellIndex
                        ];
                    }

                    const levelValues = {};

                    for (
                        let level = 1;
                        level <= depth;
                        level++
                    ) {
                        levelValues[
                            `level_${level}`
                        ] =
                            hierarchyStack[
                                level - 1
                            ];
                    }

                    rows.push({
                        row_index:
                            rowIndex,

                        stat:
                            stat,

                        depth:
                            depth,

                        parent:
                            parent,

                        path:
                            path,

                        ...levelValues,

                        data:
                            data,

                        cells:
                            values,
                    });
                }

                output.push({
                    table_index:
                        tableIndex,

                    table:
                        tableName,

                    headers:
                        headers,

                    rows:
                        rows,
                });
            }

            return output;
        }
        """
    )


# ============================================================
# RAW UI SNAPSHOT
# ============================================================

def save_page_snapshot(
    page,
    output_folder,
    section,
    side,
    expansion_result,
):
    ensure_directory(
        output_folder
    )

    # --------------------------------------------------------
    # Expanded visible text
    # --------------------------------------------------------
    try:
        page_text = (
            page.locator(
                "body"
            )
            .inner_text()
        )

        (
            output_folder
            / "expanded_page_text.txt"
        ).write_text(
            page_text,
            encoding="utf-8",
        )

    except Exception:
        pass

    # --------------------------------------------------------
    # Expanded HTML
    # --------------------------------------------------------
    try:
        html = page.content()

        (
            output_folder
            / "expanded_page.html"
        ).write_text(
            html,
            encoding="utf-8",
        )

    except Exception:
        pass

    # --------------------------------------------------------
    # CLEAN structured representation of all expanded tables
    # --------------------------------------------------------
    expanded_tables = []

    try:
        expanded_tables = (
            extract_expanded_tables(
                page
            )
        )

        write_json(
            expanded_tables,
            output_folder
            / "expanded_tables.json",
        )

    except Exception as exc:
        print(
            f"      Could not extract "
            f"expanded table structure: "
            f"{exc}"
        )

    # --------------------------------------------------------
    # Capture metadata
    # --------------------------------------------------------
    snapshot_metadata = {
        "section":
            section,

        "side":
            side,

        "url":
            page.url,

        "total_expansion_clicks":
            expansion_result.get(
                "total_expansion_clicks",
                0,
            ),

        "remaining_collapsed_rows":
            expansion_result.get(
                "remaining_collapsed_rows",
                0,
            ),

        "table_count":
            len(
                expanded_tables
            ),

        "tables":
            [
                {
                    "table":
                        table.get(
                            "table"
                        ),

                    "row_count":
                        len(
                            table.get(
                                "rows",
                                [],
                            )
                        ),
                }
                for table
                in expanded_tables
            ],

        "passes":
            expansion_result.get(
                "passes",
                [],
            ),
    }

    write_json(
        snapshot_metadata,
        output_folder
        / "capture_metadata.json",
    )


# ============================================================
# COMPLETE SECTION CAPTURE
# ============================================================

def capture_player_section(
    page,
    *,
    player_id,
    season_id,
    section,
    side,
    output_folder,
):
    section_label = (
        PLAYER_DATA_SECTIONS[
            section
        ]["label"]
    )

    print(
        f"    Opening "
        f"{section_label} "
        f"| {side}"
    )

    # --------------------------------------------------------
    # Open correct player tab directly
    # --------------------------------------------------------
    open_player_section(
        page,
        player_id,
        season_id,
        section,
    )

    # --------------------------------------------------------
    # Offense / Defense
    # --------------------------------------------------------
    switch_side(
        page,
        side,
    )

    # Let initial table data finish rendering.
    page.wait_for_timeout(
        1200
    )

    # --------------------------------------------------------
    # Fully expand every Synergy statistical hierarchy
    # --------------------------------------------------------
    expansion_result = (
        expand_all_hierarchy_rows(
            page
        )
    )

    # Let API calls / Angular rendering settle.
    page.wait_for_timeout(
        1800
    )

    # --------------------------------------------------------
    # Save HTML + text + CLEAN hierarchy JSON
    # --------------------------------------------------------
    save_page_snapshot(
        page,
        output_folder,
        section,
        side,
        expansion_result,
    )

    return expansion_result