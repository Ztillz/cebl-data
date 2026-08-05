from config.settings import (
    PAGE_LOAD_WAIT_MS,
    SYNERGY_COMPETITION_KEY,
)

from src.utils import (
    ensure_directory,
    write_json,
)


# ============================================================
# URL
# ============================================================

def build_cumulative_box_url(
    player_id,
    season_id,
):
    """
    Cumulative Box exists inside the player Logged Data pages.

    We use one matched player from each CEBL team to open it.
    """

    return (
        "https://apps.synergysports.com/"
        f"basketball/players/{player_id}/"
        f"boxscore"
        f"?seasonId={season_id}"
        f"&competitionKey={SYNERGY_COMPETITION_KEY}"
        f"&pointsSpreadExclude=0"
    )


# ============================================================
# TABLE EXTRACTION
# ============================================================

def extract_visible_tables(
    page,
):
    """
    Capture every visible HTML table on the Cumulative Box page.

    We intentionally keep this generic for the first test because
    we want to see the exact Cumulative Box structure before
    designing the final processed CSV.
    """

    return page.evaluate(
        """
        () => {
            const clean = (value) => {
                return (value || "")
                    .replace(/\\s+/g, " ")
                    .trim();
            };

            const isVisible = (element) => {
                if (!element) {
                    return false;
                }

                const style =
                    window.getComputedStyle(
                        element
                    );

                const rect =
                    element
                        .getBoundingClientRect();

                return (
                    style.display !== "none"
                    &&
                    style.visibility !== "hidden"
                    &&
                    rect.width > 0
                    &&
                    rect.height > 0
                );
            };

            const tables =
                Array.from(
                    document.querySelectorAll(
                        "table"
                    )
                )
                .filter(
                    isVisible
                );

            const output = [];

            for (
                let tableIndex = 0;
                tableIndex < tables.length;
                tableIndex++
            ) {
                const table =
                    tables[
                        tableIndex
                    ];

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

                for (
                    let rowIndex = 0;
                    rowIndex < bodyRows.length;
                    rowIndex++
                ) {
                    const row =
                        bodyRows[
                            rowIndex
                        ];

                    if (!isVisible(row)) {
                        continue;
                    }

                    const cells =
                        Array.from(
                            row.querySelectorAll(
                                ":scope > td"
                            )
                        )
                        .map(
                            cell =>
                                clean(
                                    cell.innerText
                                )
                        );

                    if (!cells.length) {
                        continue;
                    }

                    const hasValue =
                        cells.some(
                            value =>
                                value !== ""
                        );

                    if (!hasValue) {
                        continue;
                    }

                    const data = {};

                    for (
                        let columnIndex = 0;
                        columnIndex < cells.length;
                        columnIndex++
                    ) {
                        let header =
                            headers[
                                columnIndex
                            ]
                            ||
                            (
                                columnIndex === 0
                                ? "STAT"
                                : `COLUMN_${columnIndex + 1}`
                            );

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
                                    columnIndex + 1
                                }`;
                        }

                        data[
                            header
                        ] = cells[
                            columnIndex
                        ];
                    }

                    rows.push(
                        {
                            "row_index":
                                rowIndex,

                            "data":
                                data,

                            "cells":
                                cells,
                        }
                    );
                }

                /*
                Try to find a readable heading immediately
                associated with the table.
                */

                let tableName =
                    "";

                let current =
                    table.parentElement;

                for (
                    let depth = 0;
                    depth < 5 && current;
                    depth++
                ) {
                    const heading =
                        current.querySelector(
                            "h1, h2, h3, h4, h5"
                        );

                    if (heading) {
                        tableName =
                            clean(
                                heading.innerText
                            );

                        if (tableName) {
                            break;
                        }
                    }

                    current =
                        current.parentElement;
                }

                if (!tableName) {
                    tableName =
                        `Cumulative Box Table ${
                            tableIndex + 1
                        }`;
                }

                output.push(
                    {
                        "table_index":
                            tableIndex,

                        "table":
                            tableName,

                        "headers":
                            headers,

                        "row_count":
                            rows.length,

                        "rows":
                            rows,
                    }
                );
            }

            return output;
        }
        """
    )


# ============================================================
# PAGE INFORMATION
# ============================================================

def extract_page_info(
    page,
):
    """
    Save some readable page context so we can verify that the
    Cumulative Box output belongs to the expected CEBL team.
    """

    return page.evaluate(
        """
        () => {
            const clean = (value) => {
                return (value || "")
                    .replace(/\\s+/g, " ")
                    .trim();
            };

            const headings =
                Array.from(
                    document.querySelectorAll(
                        "h1, h2, h3, h4"
                    )
                )
                .map(
                    element =>
                        clean(
                            element.innerText
                        )
                )
                .filter(Boolean);

            return {
                title:
                    document.title,

                url:
                    window.location.href,

                headings:
                    headings,
            };
        }
        """
    )


# ============================================================
# RAW SNAPSHOT
# ============================================================

def save_cumulative_box_snapshot(
    page,
    output_folder,
    *,
    team_name,
    source_player,
):
    ensure_directory(
        output_folder
    )

    # --------------------------------------------------------
    # Visible text
    # --------------------------------------------------------
    try:
        body_text = (
            page.locator(
                "body"
            )
            .inner_text()
        )

        (
            output_folder
            / "cumulative_box_page_text.txt"
        ).write_text(
            body_text,
            encoding="utf-8",
        )

    except Exception:
        body_text = ""

    # --------------------------------------------------------
    # HTML
    # --------------------------------------------------------
    try:
        html = page.content()

        (
            output_folder
            / "cumulative_box_page.html"
        ).write_text(
            html,
            encoding="utf-8",
        )

    except Exception:
        pass

    # --------------------------------------------------------
    # Structured tables
    # --------------------------------------------------------
    tables = extract_visible_tables(
        page
    )

    write_json(
        tables,
        output_folder
        / "cumulative_box_tables.json",
    )

    # --------------------------------------------------------
    # Page context
    # --------------------------------------------------------
    page_info = extract_page_info(
        page
    )

    row_count = sum(
        table.get(
            "row_count",
            0,
        )
        for table in tables
    )

    metadata = {
        "team":
            team_name,

        "capture_source_player":
            source_player,

        "url":
            page.url,

        "page_title":
            page_info.get(
                "title"
            ),

        "headings":
            page_info.get(
                "headings",
                [],
            ),

        "table_count":
            len(
                tables
            ),

        "row_count":
            row_count,
    }

    write_json(
        metadata,
        output_folder
        / "capture_metadata.json",
    )

    return {
        "success":
            (
                len(tables) > 0
                and
                row_count > 0
            ),

        "table_count":
            len(tables),

        "row_count":
            row_count,

        "tables":
            tables,
    }


# ============================================================
# COMPLETE CAPTURE
# ============================================================

def capture_cumulative_box(
    page,
    *,
    player_id,
    season_id,
    team_name,
    source_player,
    output_folder,
):
    """
    Capture one Cumulative Box page.

    A matched player provides the route/context.

    The caller decides whether this team has already been
    successfully captured.
    """

    print(
        f"  Capturing Cumulative Box "
        f"| {team_name}"
    )

    print(
        f"    Source player: "
        f"{source_player}"
    )

    url = build_cumulative_box_url(
        player_id,
        season_id,
    )

    page.goto(
        url,
        wait_until="domcontentloaded",
    )

    page.wait_for_timeout(
        PAGE_LOAD_WAIT_MS
    )

    # Extra settling time because Cumulative Box may populate
    # additional tables after initial Angular rendering.
    page.wait_for_timeout(
        1500
    )

    result = (
        save_cumulative_box_snapshot(
            page,
            output_folder,

            team_name=
                team_name,

            source_player=
                source_player,
        )
    )

    print(
        f"    Tables: "
        f"{result['table_count']}"
    )

    print(
        f"    Rows: "
        f"{result['row_count']}"
    )

    if result[
        "success"
    ]:
        print(
            "    Cumulative Box capture: "
            "SUCCESS"
        )

    else:
        print(
            "    Cumulative Box capture: "
            "FAILED"
        )

    return result