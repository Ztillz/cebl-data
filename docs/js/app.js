const DATA_ROOT = "data/synergy/2026-2027";
const MANIFEST_URL = `${DATA_ROOT}/manifest.json`;

let manifest = null;

let selectedPlayer = null;
let selectedReport = "play_types";
let selectedSide = "offense";

let selectedTeam = null;
let teamSortState = {
    column: null,
    direction: null
};

let teamFilterState = {
    column: null,
    min: null,
    max: null
};

let leaderboardState = {
    report: "play_types",
    side: "offense",
    table: "",
    levelSelections: [],
    rankMetric: "PPP",
    minPoss: 10,
    currentData: null,
    currentResults: []
};

const leaderboardDataCache = {};

let leaderboardMode = "simple";

let nextAdvancedFilterId = 1;

let advancedLeaderboardState = {
    rank: {
        report: "play_types",
        side: "offense",
        table: "",
        levelSelections: [],
        metric: "PPP",
        direction: "desc",
        min: null,
        max: null,
        data: null
    },

    filters: [],

    results: []
};

/* ============================================================
   DOM
============================================================ */

const seasonLabel = document.getElementById("seasonLabel");
const dataStatus = document.getElementById("dataStatus");

const playersView = document.getElementById("playersView");
const teamsView = document.getElementById("teamsView");
const leaderboardsView = document.getElementById("leaderboardsView");

const playerSearch = document.getElementById("playerSearch");
const playerTeamFilter = document.getElementById("playerTeamFilter");
const playerList = document.getElementById("playerList");
const playerCount = document.getElementById("playerCount");

const playerEmptyState = document.getElementById("playerEmptyState");
const playerContent = document.getElementById("playerContent");

const selectedPlayerName = document.getElementById("selectedPlayerName");
const selectedPlayerTeam = document.getElementById("selectedPlayerTeam");

const playerLoading = document.getElementById("playerLoading");
const playerTables = document.getElementById("playerTables");

const teamSelect = document.getElementById("teamSelect");
const teamEmptyState = document.getElementById("teamEmptyState");
const teamContent = document.getElementById("teamContent");

const selectedTeamName = document.getElementById("selectedTeamName");
const teamLoading = document.getElementById("teamLoading");
const teamTable = document.getElementById("teamTable");

const leaderboardReport = document.getElementById("leaderboardReport");
const leaderboardSide = document.getElementById("leaderboardSide");
const leaderboardTable = document.getElementById("leaderboardTable");
const leaderboardHierarchyFields = document.getElementById("leaderboardHierarchyFields");
const leaderboardMetric = document.getElementById("leaderboardMetric");
const leaderboardMinPoss = document.getElementById("leaderboardMinPoss");
const leaderboardRun = document.getElementById("leaderboardRun");
const leaderboardDownload = document.getElementById("leaderboardDownload");
const leaderboardLoading = document.getElementById("leaderboardLoading");
const leaderboardSummary = document.getElementById("leaderboardSummary");
const leaderboardResults = document.getElementById("leaderboardResults");

const leaderboardSimpleMode =
    document.getElementById(
        "leaderboardSimpleMode"
    );

const leaderboardAdvancedMode =
    document.getElementById(
        "leaderboardAdvancedMode"
    );

const simpleLeaderboardPanel =
    document.getElementById(
        "simpleLeaderboardPanel"
    );

const advancedLeaderboardPanel =
    document.getElementById(
        "advancedLeaderboardPanel"
    );

const advancedRankBuilder =
    document.getElementById(
        "advancedRankBuilder"
    );

const advancedAddFilter =
    document.getElementById(
        "advancedAddFilter"
    );

const advancedFilters =
    document.getElementById(
        "advancedFilters"
    );

const advancedQueryDescription =
    document.getElementById(
        "advancedQueryDescription"
    );

const advancedRun =
    document.getElementById(
        "advancedRun"
    );

const advancedDownload =
    document.getElementById(
        "advancedDownload"
    );

const advancedLoading =
    document.getElementById(
        "advancedLoading"
    );

const advancedSummary =
    document.getElementById(
        "advancedSummary"
    );

const advancedResults =
    document.getElementById(
        "advancedResults"
    );

/* ============================================================
   FETCH
============================================================ */

async function fetchJson(url) {
    const response = await fetch(url, {
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} while loading ${url}`
        );
    }

    return response.json();
}


/* ============================================================
   INITIALIZATION
============================================================ */

async function initialize() {
    try {
        manifest = await fetchJson(MANIFEST_URL);

        seasonLabel.textContent =
            `${manifest.season} • ${manifest.league}`;

        dataStatus.textContent =
            `${manifest.player_count} players • ${manifest.team_count} teams`;

        dataStatus.classList.add("ready");

        populateTeamFilters();
        renderPlayerList();
        populateTeamSelect();
        await initializeLeaderboardControls();

    } catch (error) {
        console.error(error);

        dataStatus.textContent = "Data unavailable";

        playerEmptyState.innerHTML = `
            <div class="error-box">
                Could not load the Synergy manifest.<br>
                ${escapeHtml(error.message)}
            </div>
        `;
    }
}


/* ============================================================
   VIEW NAVIGATION
============================================================ */

const VIEW_MAP = {
    players: playersView,
    teams: teamsView,
    leaderboards: leaderboardsView
};

document.querySelectorAll(".view-tab").forEach(button => {
    button.addEventListener("click", () => {
        document
            .querySelectorAll(".view-tab")
            .forEach(item => item.classList.remove("active"));

        button.classList.add("active");

        const view = button.dataset.view;

        Object.entries(VIEW_MAP).forEach(
            ([key, element]) => {
                element.classList.toggle(
                    "active",
                    key === view
                );
            }
        );
    });
});
/* ============================================================
   PLAYER FILTERS
============================================================ */

function populateTeamFilters() {
    const teams = [
        ...new Set(
            manifest.players
                .map(player => player.team)
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));

    teams.forEach(team => {
        const option = document.createElement("option");

        option.value = team;
        option.textContent = team;

        playerTeamFilter.appendChild(option);
    });
}


playerSearch.addEventListener(
    "input",
    renderPlayerList
);

playerTeamFilter.addEventListener(
    "change",
    renderPlayerList
);


/* ============================================================
   PLAYER LIST
============================================================ */

function getFilteredPlayers() {
    const search = playerSearch.value
        .trim()
        .toLowerCase();

    const team = playerTeamFilter.value;

    return manifest.players
        .filter(player => {
            const matchesSearch =
                !search ||
                player.player
                    .toLowerCase()
                    .includes(search);

            const matchesTeam =
                !team ||
                player.team === team;

            return matchesSearch && matchesTeam;
        })
        .sort((a, b) =>
            a.player.localeCompare(b.player)
        );
}


function renderPlayerList() {
    if (!manifest) {
        return;
    }

    const players = getFilteredPlayers();

    playerCount.textContent = players.length;

    playerList.innerHTML = "";

    players.forEach(player => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "entity-list-item";

        if (
            selectedPlayer &&
            selectedPlayer.key === player.key
        ) {
            button.classList.add("active");
        }

        button.innerHTML = `
            <span class="entity-list-name">
                ${escapeHtml(player.player)}
            </span>

            <span class="entity-list-team">
                ${escapeHtml(player.team)}
            </span>
        `;

        button.addEventListener("click", () => {
            selectPlayer(player);
        });

        playerList.appendChild(button);
    });
}


/* ============================================================
   SELECT PLAYER
============================================================ */

async function selectPlayer(player) {
    selectedPlayer = player;

    renderPlayerList();

    playerEmptyState.classList.add("hidden");
    playerContent.classList.remove("hidden");

    selectedPlayerName.textContent = player.player;
    selectedPlayerTeam.textContent =
        `${player.team} • ${manifest.season}`;

    await loadSelectedPlayerReport();
}


/* ============================================================
   PLAYER REPORT BUTTONS
============================================================ */

document.querySelectorAll(".report-button").forEach(button => {
    button.addEventListener("click", async () => {
        document
            .querySelectorAll(".report-button")
            .forEach(item => item.classList.remove("active"));

        button.classList.add("active");

        selectedReport = button.dataset.report;

        if (selectedPlayer) {
            await loadSelectedPlayerReport();
        }
    });
});


document.querySelectorAll(".side-button").forEach(button => {
    button.addEventListener("click", async () => {
        document
            .querySelectorAll(".side-button")
            .forEach(item => item.classList.remove("active"));

        button.classList.add("active");

        selectedSide = button.dataset.side;

        if (selectedPlayer) {
            await loadSelectedPlayerReport();
        }
    });
});


/* ============================================================
   LOAD PLAYER TREE
============================================================ */

async function loadSelectedPlayerReport() {
    if (!selectedPlayer) {
        return;
    }

    playerLoading.classList.remove("hidden");
    playerTables.innerHTML = "";

    try {
        const reportInfo =
            selectedPlayer[selectedReport];

        if (!reportInfo) {
            throw new Error(
                `No ${selectedReport} data found.`
            );
        }

        const path =
            reportInfo[
                `${selectedSide}_tree`
            ];

        if (!path) {
            throw new Error(
                `No ${selectedSide} tree path found.`
            );
        }

        const data = await fetchJson(
            `${DATA_ROOT}/${path}`
        );

        renderPlayerReport(data);

    } catch (error) {
        console.error(error);

        playerTables.innerHTML = `
            <div class="error-box">
                ${escapeHtml(error.message)}
            </div>
        `;

    } finally {
        playerLoading.classList.add("hidden");
    }
}


/* ============================================================
   PLAYER REPORT RENDER
============================================================ */

function renderPlayerReport(data) {
    playerTables.innerHTML = "";

    if (
        !data.tables ||
        data.tables.length === 0
    ) {
        playerTables.innerHTML = `
            <div class="empty-state">
                <p>No report tables available.</p>
            </div>
        `;

        return;
    }

    data.tables.forEach(table => {
        const block =
            document.createElement("section");

        block.className =
            "report-table-block";


        /* ====================================================
           TABLE HEADER
        ==================================================== */

        const header =
            document.createElement("div");

        header.className =
            "report-table-title";


        const title =
            document.createElement("span");

        title.textContent =
            table.table;


        const actions =
            document.createElement("div");

        actions.className =
            "report-table-title-actions";


        const count =
            document.createElement("span");

        count.className =
            "report-table-count";

        count.textContent =
            `${table.row_count} rows`;


        const downloadButton =
            document.createElement("button");

        downloadButton.type =
            "button";

        downloadButton.className =
            "download-button";

        downloadButton.textContent =
            "Download CSV";

        downloadButton.addEventListener(
            "click",
            () => {
                downloadHierarchyTableCsv(
                    table
                );
            }
        );


        actions.appendChild(
            count
        );

        actions.appendChild(
            downloadButton
        );


        header.appendChild(
            title
        );

        header.appendChild(
            actions
        );


        block.appendChild(
            header
        );


        /* ====================================================
           TABLE
        ==================================================== */

        block.appendChild(
            buildHierarchyTable(
                table.rows
            )
        );


        playerTables.appendChild(
            block
        );
    });
}


/* ============================================================
   TREE FLATTENING
============================================================ */

function flattenTree(nodes) {
    const rows = [];

    let nextId = 1;

    function walk(
        nodeList,
        parentId = null,
        ancestorsVisible = true
    ) {
        nodeList.forEach(node => {
            const nodeId = nextId++;

            rows.push({
                id: nodeId,
                parentId,
                node,
                visible: parentId === null
            });

            walk(
                node.children || [],
                nodeId,
                false
            );
        });
    }

    walk(nodes);

    return rows;
}


/* ============================================================
   METRIC COLUMNS
============================================================ */

const PRIORITY_METRICS = [
    "POSS",
    "%TIME",
    "PTS",
    "PPP",
    "PPP RATING",
    "PPP RANK",
    "TS%",
    "FG ATT",
    "FG MADE",
    "FG%",
    "EFG%",
    "2 FG ATT",
    "2 FG%",
    "3FG ATT",
    "3 FG%",
    "FT ATT",
    "FT%",
    "TO%",
    "%FT",
    "%SF",
    "SCORE%"
];


function getMetricColumns(flatRows) {
    const columns = new Set();

    flatRows.forEach(row => {
        Object.entries(
            row.node.stats || {}
        ).forEach(([key, value]) => {
            if (
                value !== null &&
                value !== undefined &&
                value !== ""
            ) {
                columns.add(key);
            }
        });
    });

    const priority = PRIORITY_METRICS.filter(
        column => columns.has(column)
    );

    const remaining = [...columns]
        .filter(column =>
            !PRIORITY_METRICS.includes(column)
        )
        .sort();

    return [
        ...priority,
        ...remaining
    ];
}


/* ============================================================
   HIERARCHY TABLE
============================================================ */

function buildHierarchyTable(rootNodes) {
    const wrapper = document.createElement("div");

    wrapper.className = "table-scroll";

    const flatRows = flattenTree(rootNodes);

    const metricColumns =
        getMetricColumns(flatRows);

    const table = document.createElement("table");

    table.className = "data-table";

    const thead = document.createElement("thead");

    const headRow = document.createElement("tr");

    const statHeader = document.createElement("th");

    statHeader.textContent = "STAT";

    headRow.appendChild(statHeader);

    metricColumns.forEach(column => {
        const th = document.createElement("th");

        th.textContent = column;

        headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.appendChild(thead);


    const tbody = document.createElement("tbody");

    flatRows.forEach(rowInfo => {
        const {
            id,
            parentId,
            node,
            visible
        } = rowInfo;

        const tr = document.createElement("tr");

        tr.className = "tree-row";

        tr.dataset.rowId = id;

        if (parentId !== null) {
            tr.dataset.parentId = parentId;
        }

        if (!visible) {
            tr.classList.add("hidden-row");
        }

        const statCell = document.createElement("td");

        const statWrapper = document.createElement("div");

        statWrapper.className = "stat-cell";

        statWrapper.style.paddingLeft =
            `${Math.max(0, (node.depth - 1) * 18)}px`;

        const children =
            node.children || [];

        if (children.length > 0) {
            const toggle =
                document.createElement("button");

            toggle.type = "button";
            toggle.className = "tree-toggle";
            toggle.textContent = "▸";
            toggle.dataset.expanded = "false";

            toggle.addEventListener(
                "click",
                event => {
                    event.stopPropagation();

                    toggleTreeRow(
                        tbody,
                        id,
                        toggle
                    );
                }
            );

            statWrapper.appendChild(toggle);

        } else {
            const placeholder =
                document.createElement("span");

            placeholder.className =
                "tree-toggle-placeholder";

            statWrapper.appendChild(placeholder);
        }

        const label = document.createElement("span");

        label.className = "stat-label";
        label.textContent = node.stat || "";

        statWrapper.appendChild(label);

        statCell.appendChild(statWrapper);

        tr.appendChild(statCell);


        metricColumns.forEach(column => {
            const td = document.createElement("td");

            td.textContent = formatValue(
                node.stats
                    ? node.stats[column]
                    : null,
                column
            );

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    wrapper.appendChild(table);

    return wrapper;
}


/* ============================================================
   TREE EXPANSION
============================================================ */

function toggleTreeRow(
    tbody,
    rowId,
    button
) {
    const expanded =
        button.dataset.expanded === "true";

    if (expanded) {
        collapseTreeRow(
            tbody,
            rowId
        );

        button.dataset.expanded = "false";
        button.textContent = "▸";

    } else {
        showDirectChildren(
            tbody,
            rowId
        );

        button.dataset.expanded = "true";
        button.textContent = "▾";
    }
}


function showDirectChildren(
    tbody,
    parentId
) {
    tbody
        .querySelectorAll(
            `tr[data-parent-id="${parentId}"]`
        )
        .forEach(row => {
            row.classList.remove(
                "hidden-row"
            );
        });
}


function collapseTreeRow(
    tbody,
    parentId
) {
    const children = tbody.querySelectorAll(
        `tr[data-parent-id="${parentId}"]`
    );

    children.forEach(row => {
        row.classList.add("hidden-row");

        const rowId = row.dataset.rowId;

        const toggle =
            row.querySelector(".tree-toggle");

        if (toggle) {
            toggle.dataset.expanded = "false";
            toggle.textContent = "▸";
        }

        collapseTreeRow(
            tbody,
            rowId
        );
    });
}


/* ============================================================
   TEAM VIEW NAVIGATION / LOADING
   Lives in js/team.js.
============================================================ */


/* ============================================================
   TEAM TABLE SORTING
============================================================ */

function cycleTeamSort(column) {
    // First click:
    // highest -> lowest
    if (
        teamSortState.column !== column ||
        teamSortState.direction === null
    ) {
        teamSortState = {
            column,
            direction: "desc"
        };

        return;
    }

    // Second click:
    // lowest -> highest
    if (
        teamSortState.direction === "desc"
    ) {
        teamSortState = {
            column,
            direction: "asc"
        };

        return;
    }

    // Third click:
    // reset to original Synergy order
    teamSortState = {
        column: null,
        direction: null
    };
}


function getSortableValue(value) {
    if (
        value === null ||
        value === undefined ||
        value === "" ||
        value === "-" ||
        value === "—"
    ) {
        return null;
    }

    if (
        typeof value === "number"
    ) {
        return value;
    }

    const text =
        String(value).trim();

    const numericText =
        text
            .replaceAll(",", "")
            .replace("%", "")
            .trim();

    if (
        numericText !== "" &&
        !Number.isNaN(
            Number(numericText)
        )
    ) {
        return Number(
            numericText
        );
    }

    return text.toLowerCase();
}


function sortTeamRecords(
    records,
    column,
    direction
) {
    if (
        !column ||
        !direction
    ) {
        return [
            ...records
        ];
    }

    return records
        .map(
            (record, index) => ({
                record,
                originalIndex: index
            })
        )
        .sort(
            (a, b) => {
                const aValue =
                    getSortableValue(
                        a.record[column]
                    );

                const bValue =
                    getSortableValue(
                        b.record[column]
                    );


                // --------------------------------------------
                // Missing values always go to the bottom.
                // --------------------------------------------

                if (
                    aValue === null &&
                    bValue === null
                ) {
                    return (
                        a.originalIndex -
                        b.originalIndex
                    );
                }

                if (
                    aValue === null
                ) {
                    return 1;
                }

                if (
                    bValue === null
                ) {
                    return -1;
                }


                // --------------------------------------------
                // Numeric comparison
                // --------------------------------------------

                if (
                    typeof aValue === "number" &&
                    typeof bValue === "number"
                ) {
                    if (
                        aValue === bValue
                    ) {
                        return (
                            a.originalIndex -
                            b.originalIndex
                        );
                    }

                    return (
                        direction === "desc"
                            ? bValue - aValue
                            : aValue - bValue
                    );
                }


                // --------------------------------------------
                // Text comparison
                // --------------------------------------------

                const comparison =
                    String(aValue)
                        .localeCompare(
                            String(bValue)
                        );

                if (
                    comparison === 0
                ) {
                    return (
                        a.originalIndex -
                        b.originalIndex
                    );
                }

                return (
                    direction === "desc"
                        ? -comparison
                        : comparison
                );
            }
        )
        .map(
            item =>
                item.record
        );
}


function getTeamSortSymbol(column) {
    if (
        teamSortState.column !== column
    ) {
        return "↕";
    }

    if (
        teamSortState.direction === "desc"
    ) {
        return "↓";
    }

    if (
        teamSortState.direction === "asc"
    ) {
        return "↑";
    }

    return "↕";
}

/* ============================================================
   TEAM TABLE FILTERING
============================================================ */

function getNumericTeamColumns(records, columns) {
    return columns.filter(column => {
        const values = records
            .map(record => record[column])
            .filter(value =>
                value !== null &&
                value !== undefined &&
                value !== "" &&
                value !== "-" &&
                value !== "—"
            );

        if (values.length === 0) {
            return false;
        }

        return values.every(value => {
            const sortableValue =
                getSortableValue(value);

            return (
                typeof sortableValue === "number" &&
                !Number.isNaN(sortableValue)
            );
        });
    });
}


function filterTeamRecords(records) {
    const {
        column,
        min,
        max
    } = teamFilterState;

    /*
     * No active filter.
     */
    if (
        !column ||
        (
            min === null &&
            max === null
        )
    ) {
        return [...records];
    }

    return records.filter(record => {
        const value =
            getSortableValue(
                record[column]
            );

        /*
         * Missing or non-numeric values are excluded whenever
         * a numeric filter is active.
         */
        if (
            typeof value !== "number" ||
            Number.isNaN(value)
        ) {
            return false;
        }

        if (
            min !== null &&
            value < min
        ) {
            return false;
        }

        if (
            max !== null &&
            value > max
        ) {
            return false;
        }

        return true;
    });
}


function resetTeamFilter() {
    teamFilterState = {
        column: null,
        min: null,
        max: null
    };
}

function renderTeamTable(records) {
    teamTable.innerHTML = "";

    if (
        !Array.isArray(records) ||
        records.length === 0
    ) {
        teamTable.innerHTML = `
            <div class="empty-state">
                <p>No team data available.</p>
            </div>
        `;

        return;
    }


    const isAllTeams =
        selectedTeam?.allTeams === true;


    /* ========================================================
       COLUMNS
    ======================================================== */

    const excluded =
        new Set(
            isAllTeams
                ? [
                    "SEASON"
                ]
                : [
                    "TEAM",
                    "SEASON"
                ]
        );


    const allColumns = [
        ...new Set(
            records.flatMap(
                record =>
                    Object.keys(record)
            )
        )
    ].filter(
        column =>
            !excluded.has(column)
    );


    const preferred =
        isAllTeams
            ? [
                "TEAM",
                "PLAYER",
                "GP",
                "POSS",
                "PTS",
                "PPP",
                "TS%",
                "FG%",
                "EFG%",
                "3 FG%",
                "AST",
                "AST/TO",
                "TO",
                "TO%",
                "TOT REB",
                "OFF REB",
                "DEF REB",
                "STL",
                "BLK",
                "GM SCORE",
                "OFFENSIVE ROLE"
            ]
            : [
                "PLAYER",
                "GP",
                "POSS",
                "PTS",
                "PPP",
                "TS%",
                "FG%",
                "EFG%",
                "3 FG%",
                "AST",
                "AST/TO",
                "TO",
                "TO%",
                "TOT REB",
                "OFF REB",
                "DEF REB",
                "STL",
                "BLK",
                "GM SCORE",
                "OFFENSIVE ROLE"
            ];


    const columns = [
        ...preferred.filter(
            column =>
                allColumns.includes(column)
        ),

        ...allColumns.filter(
            column =>
                !preferred.includes(column)
        )
    ];


    const numericColumns =
        getNumericTeamColumns(
            records,
            columns
        );


    /*
     * If the currently selected filter column does not exist
     * in this team, clear the filter automatically.
     */
    if (
        teamFilterState.column &&
        !numericColumns.includes(
            teamFilterState.column
        )
    ) {
        resetTeamFilter();
    }


    /* ========================================================
       FILTER AND SORT
    ======================================================== */

    const filteredRecords =
        filterTeamRecords(records);


    const displayedRecords =
        sortTeamRecords(
            filteredRecords,
            teamSortState.column,
            teamSortState.direction
        );


    /* ========================================================
       REPORT BLOCK
    ======================================================== */

    const block =
        document.createElement("section");

    block.className =
        "report-table-block team-table";


    /* ========================================================
       HEADER
    ======================================================== */

    const header =
        document.createElement("div");

    header.className =
        "report-table-title";


    const title =
        document.createElement("span");

    title.textContent =
        selectedTeam.team;


    const actions =
        document.createElement("div");

    actions.className =
        "report-table-title-actions";


    const count =
        document.createElement("span");

    count.className =
        "report-table-count";


    if (
        displayedRecords.length ===
        records.length
    ) {
        count.textContent =
            isAllTeams
                ? `${records.length} player rows`
                : `${records.length} players`;
    } else {
        count.textContent =
            `${displayedRecords.length} of ${records.length} players`;
    }


    const downloadButton =
        document.createElement("button");

    downloadButton.type =
        "button";

    downloadButton.className =
        "download-button";

    downloadButton.textContent =
        "Download CSV";

    downloadButton.addEventListener(
        "click",
        () => {
            /*
             * Download only the rows currently shown,
             * in their current sorted order.
             */
            downloadTeamTableCsv(
                displayedRecords
            );
        }
    );


    actions.appendChild(count);
    actions.appendChild(downloadButton);

    header.appendChild(title);
    header.appendChild(actions);

    block.appendChild(header);


    /* ========================================================
       FILTER CONTROLS
    ======================================================== */

    const filterBar =
        document.createElement("div");

    filterBar.className =
        "team-filter-bar";


    const filterTitle =
        document.createElement("span");

    filterTitle.className =
        "team-filter-title";

    filterTitle.textContent =
        "Filter players";


    const columnGroup =
        document.createElement("label");

    columnGroup.className =
        "team-filter-field";


    const columnLabel =
        document.createElement("span");

    columnLabel.textContent =
        "Stat";


    const columnSelect =
        document.createElement("select");

    columnSelect.className =
        "team-filter-select";


    const emptyOption =
        document.createElement("option");

    emptyOption.value = "";
    emptyOption.textContent =
        "Choose a stat";

    columnSelect.appendChild(
        emptyOption
    );


    numericColumns.forEach(column => {
        const option =
            document.createElement("option");

        option.value =
            column;

        option.textContent =
            column;

        if (
            teamFilterState.column ===
            column
        ) {
            option.selected =
                true;
        }

        columnSelect.appendChild(
            option
        );
    });


    columnGroup.appendChild(
        columnLabel
    );

    columnGroup.appendChild(
        columnSelect
    );


    const minGroup =
        document.createElement("label");

    minGroup.className =
        "team-filter-field";


    const minLabel =
        document.createElement("span");

    minLabel.textContent =
        "Minimum";


    const minInput =
        document.createElement("input");

    minInput.type =
        "number";

    minInput.step =
        "any";

    minInput.className =
        "team-filter-input";

    minInput.placeholder =
        "No minimum";

    minInput.value =
        teamFilterState.min ??
        "";


    minGroup.appendChild(
        minLabel
    );

    minGroup.appendChild(
        minInput
    );


    const maxGroup =
        document.createElement("label");

    maxGroup.className =
        "team-filter-field";


    const maxLabel =
        document.createElement("span");

    maxLabel.textContent =
        "Maximum";


    const maxInput =
        document.createElement("input");

    maxInput.type =
        "number";

    maxInput.step =
        "any";

    maxInput.className =
        "team-filter-input";

    maxInput.placeholder =
        "No maximum";

    maxInput.value =
        teamFilterState.max ??
        "";


    maxGroup.appendChild(
        maxLabel
    );

    maxGroup.appendChild(
        maxInput
    );


    const filterActions =
        document.createElement("div");

    filterActions.className =
        "team-filter-actions";


    const applyButton =
        document.createElement("button");

    applyButton.type =
        "button";

    applyButton.className =
        "team-filter-button primary";

    applyButton.textContent =
        "Apply filter";


    applyButton.addEventListener(
        "click",
        () => {
            const column =
                columnSelect.value ||
                null;


            let min =
                minInput.value === ""
                    ? null
                    : Number(
                        minInput.value
                    );


            let max =
                maxInput.value === ""
                    ? null
                    : Number(
                        maxInput.value
                    );


            if (
                min !== null &&
                Number.isNaN(min)
            ) {
                min =
                    null;
            }


            if (
                max !== null &&
                Number.isNaN(max)
            ) {
                max =
                    null;
            }


            /*
             * If the values were accidentally entered backwards,
             * reverse them automatically.
             */
            if (
                min !== null &&
                max !== null &&
                min > max
            ) {
                [
                    min,
                    max
                ] = [
                    max,
                    min
                ];
            }


            teamFilterState = {
                column,
                min,
                max
            };


            renderTeamTable(
                records
            );
        }
    );


    const clearButton =
        document.createElement("button");

    clearButton.type =
        "button";

    clearButton.className =
        "team-filter-button";

    clearButton.textContent =
        "Clear";


    clearButton.addEventListener(
        "click",
        () => {
            resetTeamFilter();

            renderTeamTable(
                records
            );
        }
    );


    filterActions.appendChild(
        applyButton
    );

    filterActions.appendChild(
        clearButton
    );


    filterBar.appendChild(
        filterTitle
    );

    filterBar.appendChild(
        columnGroup
    );

    filterBar.appendChild(
        minGroup
    );

    filterBar.appendChild(
        maxGroup
    );

    filterBar.appendChild(
        filterActions
    );


    block.appendChild(
        filterBar
    );


    /* ========================================================
       EMPTY FILTER RESULT
    ======================================================== */

    if (
        displayedRecords.length === 0
    ) {
        const noResults =
            document.createElement("div");

        noResults.className =
            "team-filter-empty";

        noResults.textContent =
            "No players match the current filter.";

        block.appendChild(
            noResults
        );

        teamTable.appendChild(
            block
        );

        return;
    }


    /* ========================================================
       TABLE
    ======================================================== */

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "table-scroll";


    const table =
        document.createElement("table");

    table.className =
        "data-table sortable-team-table";


    const thead =
        document.createElement("thead");

    const headerRow =
        document.createElement("tr");


    columns.forEach(column => {
        const th =
            document.createElement("th");


        const button =
            document.createElement("button");

        button.type =
            "button";

        button.className =
            "sortable-header-button";


        if (
            teamSortState.column ===
            column
        ) {
            button.classList.add(
                "active"
            );
        }


        const label =
            document.createElement("span");

        label.textContent =
            column;


        const sortSymbol =
            document.createElement("span");

        sortSymbol.className =
            "sort-symbol";

        sortSymbol.textContent =
            getTeamSortSymbol(
                column
            );


        button.appendChild(
            label
        );

        button.appendChild(
            sortSymbol
        );


        button.addEventListener(
            "click",
            () => {
                cycleTeamSort(
                    column
                );

                renderTeamTable(
                    records
                );
            }
        );


        th.appendChild(
            button
        );

        headerRow.appendChild(
            th
        );
    });


    thead.appendChild(
        headerRow
    );

    table.appendChild(
        thead
    );


    const tbody =
        document.createElement("tbody");


    displayedRecords.forEach(record => {
        const tr =
            document.createElement("tr");


        columns.forEach(column => {
            const td =
                document.createElement("td");

            td.textContent =
                formatValue(
                    record[column],
                    column
                );

            tr.appendChild(
                td
            );
        });


        tbody.appendChild(
            tr
        );
    });


    table.appendChild(
        tbody
    );

    wrapper.appendChild(
        table
    );

    block.appendChild(
        wrapper
    );

    teamTable.appendChild(
        block
    );
}

/* ============================================================
   LEADERBOARDS
============================================================ */

const LEADERBOARD_METRIC_PRIORITY = [
    "PPP",
    "PPS",
    "POSS",
    "PTS",
    "%TIME",
    "TS%",
    "FG%",
    "EFG%",
    "2 FG%",
    "3 FG%",
    "TO%",
    "%FT",
    "%SF",
    "SCORE%",
    "PPP RANK",
    "FG ATT",
    "FG MADE",
    "2 FG ATT",
    "2 FG MADE",
    "3FG ATT",
    "3 FG MADE",
    "+1%"
];


function getOrderedUniqueValues(values) {
    const seen = new Set();
    const ordered = [];

    values.forEach(value => {
        if (
            value === null ||
            value === undefined
        ) {
            return;
        }

        const text =
            String(value).trim();

        if (
            !text ||
            seen.has(text)
        ) {
            return;
        }

        seen.add(text);
        ordered.push(text);
    });

    return ordered;
}


function getLeaderboardPath(
    report,
    side
) {
    return (
        manifest?.leaderboards?.[report]?.[side]
        ||
        `combined/leaderboard_${report}_${side}.json`
    );
}


async function initializeLeaderboardControls() {
    if (!leaderboardReport) {
        return;
    }

    leaderboardReport.value =
        leaderboardState.report;

    leaderboardSide.value =
        leaderboardState.side;

    leaderboardMinPoss.value =
        leaderboardState.minPoss;

    leaderboardReport.addEventListener(
        "change",
        async () => {
            leaderboardState.report =
                leaderboardReport.value;

            leaderboardState.table =
                "";

            leaderboardState.levelSelections =
                [];

            leaderboardState.rankMetric =
                "PPP";

            await loadLeaderboardDataset();
        }
    );

    leaderboardSide.addEventListener(
        "change",
        async () => {
            leaderboardState.side =
                leaderboardSide.value;

            leaderboardState.table =
                "";

            leaderboardState.levelSelections =
                [];

            leaderboardState.rankMetric =
                "PPP";

            await loadLeaderboardDataset();
        }
    );

    leaderboardTable.addEventListener(
        "change",
        () => {
            leaderboardState.table =
                leaderboardTable.value;

            leaderboardState.levelSelections =
                [];

            buildLeaderboardHierarchyControls();
            populateLeaderboardMetricSelect();
            runLeaderboardQuery();
        }
    );

    leaderboardMetric.addEventListener(
        "change",
        () => {
            leaderboardState.rankMetric =
                leaderboardMetric.value;

            runLeaderboardQuery();
        }
    );

    leaderboardRun.addEventListener(
        "click",
        () => {
            runLeaderboardQuery();
        }
    );

    leaderboardDownload.addEventListener(
        "click",
        () => {
            downloadLeaderboardResultsCsv();
        }
    );

    await loadLeaderboardDataset();
}


async function loadLeaderboardDataset() {
    leaderboardLoading.classList.remove(
        "hidden"
    );

    leaderboardResults.innerHTML = "";
    leaderboardSummary.innerHTML = "";
    leaderboardSummary.classList.add(
        "hidden"
    );

    try {
        const path =
            getLeaderboardPath(
                leaderboardState.report,
                leaderboardState.side
            );

        if (
            !leaderboardDataCache[path]
        ) {
            leaderboardDataCache[path] =
                await fetchJson(
                    `${DATA_ROOT}/${path}`
                );
        }

        leaderboardState.currentData =
            leaderboardDataCache[path];

        populateLeaderboardTableSelect();
        buildLeaderboardHierarchyControls();
        populateLeaderboardMetricSelect();
        runLeaderboardQuery();

    } catch (error) {
        console.error(error);

        leaderboardResults.innerHTML = `
            <div class="error-box">
                ${escapeHtml(error.message)}
            </div>
        `;

    } finally {
        leaderboardLoading.classList.add(
            "hidden"
        );
    }
}


function populateLeaderboardTableSelect() {
    const data =
        leaderboardState.currentData;

    leaderboardTable.innerHTML = "";

    if (
        !data ||
        !Array.isArray(data.table_names)
    ) {
        return;
    }

    data.table_names.forEach(tableName => {
        const option =
            document.createElement("option");

        option.value =
            tableName;

        option.textContent =
            tableName;

        leaderboardTable.appendChild(
            option
        );
    });

    if (
        !data.table_names.includes(
            leaderboardState.table
        )
    ) {
        leaderboardState.table =
            data.table_names[0] || "";
    }

    leaderboardTable.value =
        leaderboardState.table;
}


function getLeaderboardTableRows() {
    const data =
        leaderboardState.currentData;

    if (
        !data ||
        !Array.isArray(data.rows)
    ) {
        return [];
    }

    return data.rows.filter(
        row =>
            row.TABLE ===
            leaderboardState.table
    );
}


function buildLeaderboardHierarchyControls() {
    const data =
        leaderboardState.currentData;

    leaderboardHierarchyFields.innerHTML = "";

    if (
        !data ||
        !leaderboardState.table
    ) {
        return;
    }

    const levelColumns =
        data.level_columns || [];

    let workingRows =
        getLeaderboardTableRows();

    const nextSelections = [];


    for (
        let index = 0;
        index < levelColumns.length;
        index += 1
    ) {
        const levelColumn =
            levelColumns[index];


        const options =
            getOrderedUniqueValues(
                workingRows.map(
                    row =>
                        row[levelColumn]
                )
            );


        if (
            options.length === 0
        ) {
            break;
        }


        /* ====================================================
           SELECTED VALUE

           Level 1:
           Always requires a selection.

           Level 2+:
           Blank means "stop hierarchy here".
        ==================================================== */

        let selectedValue =
            leaderboardState.levelSelections[
                index
            ] || "";


        // ----------------------------------------------------
        // LEVEL 1
        // ----------------------------------------------------

        if (
            index === 0
        ) {
            if (
                !selectedValue ||
                !options.includes(
                    selectedValue
                )
            ) {
                selectedValue =
                    options[0];
            }
        }

        // ----------------------------------------------------
        // LEVEL 2+
        // ----------------------------------------------------

        else {
            if (
                selectedValue &&
                !options.includes(
                    selectedValue
                )
            ) {
                selectedValue =
                    "";
            }
        }


        /* ====================================================
           CREATE FIELD
        ==================================================== */

        const field =
            document.createElement(
                "label"
            );

        field.className =
            "leaderboard-field";


        const label =
            document.createElement(
                "span"
            );

        label.textContent =
            index === 0
                ? "Stat"
                : `Level ${index + 1}`;


        const select =
            document.createElement(
                "select"
            );

        select.className =
            "control";


        /* ====================================================
           LEVEL 2+ GETS A STOP OPTION
        ==================================================== */

        if (
            index > 0
        ) {
            const stopOption =
                document.createElement(
                    "option"
                );

            stopOption.value =
                "";

            const parentName =
                nextSelections[
                    nextSelections.length - 1
                ] || "current level";

            stopOption.textContent =
                `Stop at ${parentName}`;

            select.appendChild(
                stopOption
            );
        }


        /* ====================================================
           OPTIONS
        ==================================================== */

        options.forEach(
            optionValue => {
                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    optionValue;

                option.textContent =
                    optionValue;

                if (
                    optionValue ===
                    selectedValue
                ) {
                    option.selected =
                        true;
                }

                select.appendChild(
                    option
                );
            }
        );


        /* ====================================================
           CHANGE
        ==================================================== */

        select.addEventListener(
            "change",
            () => {
                const previousSelections =
                    leaderboardState
                        .levelSelections
                        .slice(
                            0,
                            index
                        );


                if (
                    select.value
                ) {
                    leaderboardState
                        .levelSelections = [
                            ...previousSelections,
                            select.value
                        ];
                } else {
                    /*
                     * Blank means stop at the parent level.
                     */
                    leaderboardState
                        .levelSelections =
                        previousSelections;
                }


                buildLeaderboardHierarchyControls();

                populateLeaderboardMetricSelect();

                runLeaderboardQuery();
            }
        );


        field.appendChild(
            label
        );

        field.appendChild(
            select
        );

        leaderboardHierarchyFields.appendChild(
            field
        );


        /* ====================================================
           STOP HERE

           If Level 2+ is blank, don't create Level 3/4/5...
        ==================================================== */

        if (
            index > 0 &&
            !selectedValue
        ) {
            break;
        }


        nextSelections.push(
            selectedValue
        );


        workingRows =
            workingRows.filter(
                row =>
                    row[levelColumn] ===
                    selectedValue
            );
    }


    leaderboardState.levelSelections =
        nextSelections;
}


function getLeaderboardExactRows() {
    const data =
        leaderboardState.currentData;

    if (
        !data ||
        !leaderboardState.table
    ) {
        return [];
    }

    const levelColumns =
        data.level_columns || [];

    let rows =
        getLeaderboardTableRows();

    const selectedLevels =
        leaderboardState.levelSelections
            .filter(Boolean);

    selectedLevels.forEach(
        (selectedValue, index) => {
            const levelColumn =
                levelColumns[index];

            rows = rows.filter(
                row =>
                    row[levelColumn] ===
                    selectedValue
            );
        }
    );

    if (
        selectedLevels.length > 0
    ) {
        rows = rows.filter(
            row =>
                Number(
                    row.DEPTH
                ) ===
                selectedLevels.length
        );
    }

    return rows;
}


function getLeaderboardMetricOptions(
    rows
) {
    const data =
        leaderboardState.currentData;

    if (!data) {
        return [];
    }

    const baseMetricColumns =
        data.numeric_metric_columns || [];

    const availableMetrics =
        baseMetricColumns.filter(
            column =>
                rows.some(row => {
                    const value =
                        getSortableValue(
                            row[column]
                        );

                    return (
                        typeof value ===
                        "number"
                    );
                })
        );

    const priority =
        LEADERBOARD_METRIC_PRIORITY.filter(
            column =>
                availableMetrics.includes(
                    column
                )
        );

    const remaining =
        availableMetrics.filter(
            column =>
                !LEADERBOARD_METRIC_PRIORITY.includes(
                    column
                )
        ).sort();

    return [
        ...priority,
        ...remaining
    ];
}


function populateLeaderboardMetricSelect() {
    const exactRows =
        getLeaderboardExactRows();

    const fallbackRows =
        getLeaderboardTableRows();

    const sourceRows =
        exactRows.length > 0
            ? exactRows
            : fallbackRows;

    const metricOptions =
        getLeaderboardMetricOptions(
            sourceRows
        );

    leaderboardMetric.innerHTML = "";

    metricOptions.forEach(column => {
        const option =
            document.createElement(
                "option"
            );

        option.value =
            column;

        option.textContent =
            column;

        leaderboardMetric.appendChild(
            option
        );
    });

    let nextMetric =
        leaderboardState.rankMetric;

    if (
        !metricOptions.includes(
            nextMetric
        )
    ) {
        nextMetric =
            metricOptions.includes(
                "PPP"
            )
                ? "PPP"
                : (
                    metricOptions[0]
                    || ""
                );
    }

    leaderboardState.rankMetric =
        nextMetric;

    leaderboardMetric.value =
        nextMetric;
}


function runLeaderboardQuery() {
    const minPossValue =
        Number(
            leaderboardMinPoss.value
        );

    leaderboardState.minPoss =
        Number.isNaN(
            minPossValue
        )
            ? 0
            : minPossValue;

    leaderboardState.rankMetric =
        leaderboardMetric.value;

    const metric =
        leaderboardState.rankMetric;

    const exactRows =
        getLeaderboardExactRows();

    const filteredRows =
        exactRows.filter(row => {
            const possValue =
                getSortableValue(
                    row.POSS
                );

            return (
                typeof possValue ===
                "number"
                &&
                possValue >=
                leaderboardState.minPoss
            );
        });

    const rankedRows =
        filteredRows
            .slice()
            .sort(
                (a, b) => {
                    const aValue =
                        getSortableValue(
                            a[metric]
                        );

                    const bValue =
                        getSortableValue(
                            b[metric]
                        );

                    if (
                        aValue === null &&
                        bValue === null
                    ) {
                        return String(
                            a.PLAYER
                        ).localeCompare(
                            String(
                                b.PLAYER
                            )
                        );
                    }

                    if (
                        aValue === null
                    ) {
                        return 1;
                    }

                    if (
                        bValue === null
                    ) {
                        return -1;
                    }

                    if (
                        typeof aValue ===
                        "number"
                        &&
                        typeof bValue ===
                        "number"
                    ) {
                        if (
                            aValue !== bValue
                        ) {
                            return (
                                bValue - aValue
                            );
                        }
                    } else {
                        const comparison =
                            String(
                                aValue
                            ).localeCompare(
                                String(
                                    bValue
                                )
                            );

                        if (
                            comparison !== 0
                        ) {
                            return comparison;
                        }
                    }

                    const aPoss =
                        getSortableValue(
                            a.POSS
                        ) ?? 0;

                    const bPoss =
                        getSortableValue(
                            b.POSS
                        ) ?? 0;

                    if (
                        aPoss !== bPoss
                    ) {
                        return (
                            bPoss - aPoss
                        );
                    }

                    return String(
                        a.PLAYER
                    ).localeCompare(
                        String(
                            b.PLAYER
                        )
                    );
                }
            )
            .map(
                (row, index) => ({
                    RANK:
                        index + 1,
                    ...row
                })
            );

    leaderboardState.currentResults =
        rankedRows;

    renderLeaderboardSummary();
    renderLeaderboardResults();
}


function renderLeaderboardSummary() {
    const selectedLevels =
        leaderboardState.levelSelections
            .filter(Boolean);

    const pieces = [
        `Report: ${
            leaderboardState.report ===
            "play_types"
                ? "Play Types"
                : "Shot Types"
        }`,
        `Side: ${
            leaderboardState.side
                .charAt(0)
                .toUpperCase()
            + leaderboardState.side
                .slice(1)
        }`,
        `Table: ${
            leaderboardState.table
        }`
    ];

    if (
        selectedLevels.length > 0
    ) {
        pieces.push(
            `Path: ${
                selectedLevels.join(
                    " > "
                )
            }`
        );
    }

    pieces.push(
        `Rank By: ${
            leaderboardState.rankMetric
        }`
    );

    pieces.push(
        `Min POSS: ${
            leaderboardState.minPoss
        }`
    );

    pieces.push(
        `Results: ${
            leaderboardState.currentResults
                .length
        }`
    );

    leaderboardSummary.innerHTML = "";

    pieces.forEach(piece => {
        const pill =
            document.createElement(
                "span"
            );

        pill.className =
            "leaderboard-pill";

        pill.textContent =
            piece;

        leaderboardSummary.appendChild(
            pill
        );
    });

    leaderboardSummary.classList.remove(
        "hidden"
    );
}


function renderLeaderboardResults() {
    leaderboardResults.innerHTML = "";

    const metric =
        leaderboardState.rankMetric;

    const results =
        leaderboardState.currentResults;

    if (
        !results ||
        results.length === 0
    ) {
        leaderboardResults.innerHTML = `
            <div class="empty-state">
                <p>No players matched the current leaderboard query.</p>
            </div>
        `;

        return;
    }

    const columns = [
        "RANK",
        "PLAYER",
        "TEAM",
        "POSS"
    ];

    if (
        metric &&
        metric !== "POSS"
    ) {
        columns.push(metric);
    }

    const block =
        document.createElement(
            "section"
        );

    block.className =
        "report-table-block";

    const header =
        document.createElement(
            "div"
        );

    header.className =
        "report-table-title";

    const title =
        document.createElement(
            "span"
        );

    title.textContent =
        "Leaderboard Results";

    const count =
        document.createElement(
            "span"
        );

    count.className =
        "report-table-count";

    count.textContent =
        `${results.length} rows`;

    header.appendChild(
        title
    );

    header.appendChild(
        count
    );

    block.appendChild(
        header
    );

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.className =
        "table-scroll";

    const table =
        document.createElement(
            "table"
        );

    table.className =
        "data-table leaderboard-table";

    const thead =
        document.createElement(
            "thead"
        );

    const headerRow =
        document.createElement(
            "tr"
        );

    columns.forEach(column => {
        const th =
            document.createElement(
                "th"
            );

        th.textContent =
            column;

        if (column === "RANK") {
            th.className =
                "leaderboard-rank-col";
        } else if (column === "PLAYER") {
            th.className =
                "leaderboard-player-col";
        } else if (column === "TEAM") {
            th.className =
                "leaderboard-team-col";
        } else {
            th.className =
                "leaderboard-number-col";
        }

        headerRow.appendChild(
            th
        );
    });

    thead.appendChild(
        headerRow
    );

    table.appendChild(
        thead
    );

    const tbody =
        document.createElement(
            "tbody"
        );

    results.forEach(row => {
        const tr =
            document.createElement(
                "tr"
            );

        columns.forEach(column => {
            const td =
                document.createElement(
                    "td"
                );

            td.textContent =
                formatValue(
                    row[column],
                    column
                );

            if (column === "RANK") {
                td.className =
                    "leaderboard-rank-col";
            } else if (column === "PLAYER") {
                td.className =
                    "leaderboard-player-col";
            } else if (column === "TEAM") {
                td.className =
                    "leaderboard-team-col";
            } else {
                td.className =
                    "leaderboard-number-col";
            }

            tr.appendChild(
                td
            );
        });

        tbody.appendChild(
            tr
        );
    });

    table.appendChild(
        tbody
    );

    wrapper.appendChild(
        table
    );

    block.appendChild(
        wrapper
    );

    leaderboardResults.appendChild(
        block
    );
}


function downloadLeaderboardResultsCsv() {
    const results =
        leaderboardState.currentResults;

    const data =
        leaderboardState.currentData;

    if (
        !results ||
        results.length === 0 ||
        !data
    ) {
        return;
    }

    const levelColumns =
        data.level_columns || [];

    const metricColumns =
        data.metric_columns || [];

    const columns = [
        "RANK",
        "PLAYER",
        "TEAM",
        "SEASON",
        "SIDE",
        "TABLE",
        "STAT",
        "DEPTH",
        "PARENT",
        "PATH",
        ...levelColumns,
        ...metricColumns
    ];

    const filename = [
        "leaderboard",
        leaderboardState.report,
        leaderboardState.side,
        sanitizeFilenamePart(
            leaderboardState.table
        ),
        sanitizeFilenamePart(
            leaderboardState.rankMetric
        )
    ]
        .filter(Boolean)
        .join("__")
        + ".csv";

    downloadCsv(
        filename,
        results,
        columns
    );
}

/* ============================================================
   ADVANCED LEADERBOARD
============================================================ */

function createAdvancedFilter() {
    return {
        id:
            nextAdvancedFilterId++,

        report:
            "play_types",

        side:
            "offense",

        table:
            "",

        levelSelections:
            [],

        metric:
            "POSS",

        operator:
            ">=",

        value:
            0,

        data:
            null
    };
}


function setLeaderboardMode(
    mode
) {
    leaderboardMode =
        mode;

    const simple =
        mode === "simple";

    leaderboardSimpleMode.classList.toggle(
        "active",
        simple
    );

    leaderboardAdvancedMode.classList.toggle(
        "active",
        !simple
    );

    simpleLeaderboardPanel.classList.toggle(
        "hidden",
        !simple
    );

    advancedLeaderboardPanel.classList.toggle(
        "hidden",
        simple
    );
}


/* ============================================================
   DATA LOADING
============================================================ */

async function loadAdvancedDefinitionData(
    definition
) {
    const path =
        getLeaderboardPath(
            definition.report,
            definition.side
        );

    if (
        !leaderboardDataCache[
            path
        ]
    ) {
        leaderboardDataCache[
            path
        ] =
            await fetchJson(
                `${DATA_ROOT}/${path}`
            );
    }

    definition.data =
        leaderboardDataCache[
            path
        ];
}


function getAdvancedTableRows(
    definition
) {
    if (
        !definition.data ||
        !Array.isArray(
            definition.data.rows
        )
    ) {
        return [];
    }

    return definition.data.rows.filter(
        row =>
            row.TABLE ===
            definition.table
    );
}


function normalizeAdvancedDefinition(
    definition
) {
    if (!definition.data) {
        return;
    }

    const tableNames =
        definition.data
            .table_names || [];

    if (
        !tableNames.includes(
            definition.table
        )
    ) {
        definition.table =
            tableNames[0] || "";

        definition.levelSelections =
            [];
    }

    normalizeAdvancedHierarchy(
        definition
    );

    normalizeAdvancedDefinitionMetric(
        definition
    );
}


async function prepareAdvancedDefinition(
    definition
) {
    await loadAdvancedDefinitionData(
        definition
    );

    normalizeAdvancedDefinition(
        definition
    );
}


/* ============================================================
   HIERARCHY
============================================================ */

function normalizeAdvancedHierarchy(
    definition
) {
    if (
        !definition.data ||
        !definition.table
    ) {
        definition.levelSelections =
            [];

        return;
    }

    const levelColumns =
        definition.data
            .level_columns || [];

    let workingRows =
        getAdvancedTableRows(
            definition
        );

    const nextSelections = [];


    for (
        let index = 0;
        index < levelColumns.length;
        index += 1
    ) {
        const levelColumn =
            levelColumns[index];

        const options =
            getOrderedUniqueValues(
                workingRows.map(
                    row =>
                        row[levelColumn]
                )
            );


        if (
            options.length === 0
        ) {
            break;
        }


        let selected =
            definition
                .levelSelections[
                    index
                ] || "";


        /*
         * First level must have a value.
         */
        if (
            index === 0
        ) {
            if (
                !selected ||
                !options.includes(
                    selected
                )
            ) {
                selected =
                    options[0];
            }

        } else {

            /*
             * Blank means:
             * stop at the parent level.
             */
            if (
                !selected ||
                !options.includes(
                    selected
                )
            ) {
                break;
            }
        }


        nextSelections.push(
            selected
        );


        workingRows =
            workingRows.filter(
                row =>
                    row[levelColumn] ===
                    selected
            );
    }


    definition.levelSelections =
        nextSelections;
}


function getAdvancedExactRows(
    definition
) {
    if (
        !definition.data ||
        !definition.table
    ) {
        return [];
    }

    const selectedLevels =
        definition
            .levelSelections
            .filter(Boolean);

    if (
        selectedLevels.length === 0
    ) {
        return [];
    }

    const levelColumns =
        definition.data
            .level_columns || [];

    let rows =
        getAdvancedTableRows(
            definition
        );


    selectedLevels.forEach(
        (
            selectedValue,
            index
        ) => {
            const levelColumn =
                levelColumns[index];

            rows =
                rows.filter(
                    row =>
                        row[levelColumn] ===
                        selectedValue
                );
        }
    );


    /*
     * Important:
     * only return the exact hierarchy depth selected.
     *
     * If Drives is selected and we stop there,
     * we rank the Drives row itself,
     * not its children.
     */
    return rows.filter(
        row =>
            Number(
                row.DEPTH
            ) ===
            selectedLevels.length
    );
}


function appendAdvancedHierarchyControls(
    definition,
    container,
    onChange
) {
    const levelColumns =
        definition.data
            ?.level_columns || [];

    let workingRows =
        getAdvancedTableRows(
            definition
        );


    for (
        let index = 0;
        index < levelColumns.length;
        index += 1
    ) {
        const levelColumn =
            levelColumns[index];

        const options =
            getOrderedUniqueValues(
                workingRows.map(
                    row =>
                        row[levelColumn]
                )
            );


        if (
            options.length === 0
        ) {
            break;
        }


        const selected =
            definition
                .levelSelections[
                    index
                ] || "";


        const field =
            createAdvancedField(
                index === 0
                    ? "Category"
                    : `Level ${index + 1}`
            );


        const select =
            document.createElement(
                "select"
            );

        select.className =
            "control";


        if (
            index > 0
        ) {
            const stopOption =
                document.createElement(
                    "option"
                );

            stopOption.value =
                "";

            stopOption.textContent =
                `Stop at ${
                    definition
                        .levelSelections[
                            index - 1
                        ]
                }`;

            select.appendChild(
                stopOption
            );
        }


        options.forEach(
            value => {
                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    value;

                option.textContent =
                    value;

                option.selected =
                    value ===
                    selected;

                select.appendChild(
                    option
                );
            }
        );


        select.addEventListener(
            "change",
            () => {
                const previous =
                    definition
                        .levelSelections
                        .slice(
                            0,
                            index
                        );


                if (
                    select.value
                ) {
                    definition
                        .levelSelections = [
                            ...previous,
                            select.value
                        ];

                } else {
                    definition
                        .levelSelections =
                            previous;
                }


                normalizeAdvancedHierarchy(
                    definition
                );

                normalizeAdvancedDefinitionMetric(
                    definition
                );

                onChange();
            }
        );


        field.appendChild(
            select
        );

        container.appendChild(
            field
        );


        if (
            index > 0 &&
            !selected
        ) {
            break;
        }


        workingRows =
            workingRows.filter(
                row =>
                    row[levelColumn] ===
                    selected
            );
    }
}


/* ============================================================
   METRICS
============================================================ */

function getAdvancedDefinitionMetrics(
    definition
) {
    if (
        !definition.data
    ) {
        return [];
    }

    const rows =
        getAdvancedExactRows(
            definition
        );

    const numericMetrics =
        definition.data
            .numeric_metric_columns ||
        [];


    return numericMetrics.filter(
        metric =>
            rows.some(
                row => {
                    const value =
                        getSortableValue(
                            row[metric]
                        );

                    return (
                        typeof value ===
                        "number"
                    );
                }
            )
    );
}


function normalizeAdvancedDefinitionMetric(
    definition
) {
    const metrics =
        getAdvancedDefinitionMetrics(
            definition
        );


    if (
        metrics.includes(
            definition.metric
        )
    ) {
        return;
    }


    if (
        metrics.includes(
            "PPP"
        )
    ) {
        definition.metric =
            "PPP";

        return;
    }


    if (
        metrics.includes(
            "POSS"
        )
    ) {
        definition.metric =
            "POSS";

        return;
    }


    definition.metric =
        metrics[0] || "";
}


/* ============================================================
   GENERAL FIELD BUILDER
============================================================ */

function createAdvancedField(
    labelText
) {
    const field =
        document.createElement(
            "label"
        );

    field.className =
        "leaderboard-field advanced-condition-field";


    const label =
        document.createElement(
            "span"
        );

    label.textContent =
        labelText;


    field.appendChild(
        label
    );


    return field;
}


/* ============================================================
   PRIMARY RANK BUILDER
============================================================ */

function renderAdvancedRankBuilder() {
    const rank =
        advancedLeaderboardState.rank;

    advancedRankBuilder.innerHTML =
        "";


    const controls =
        document.createElement(
            "div"
        );

    controls.className =
        "advanced-condition-controls";


    /* ========================================================
       REPORT
    ======================================================== */

    const reportField =
        createAdvancedField(
            "Report"
        );

    const reportSelect =
        document.createElement(
            "select"
        );

    reportSelect.className =
        "control";


    [
        [
            "play_types",
            "Play Types"
        ],

        [
            "shot_types",
            "Shot Types"
        ]
    ].forEach(
        ([value, label]) => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                value;

            option.textContent =
                label;

            option.selected =
                value ===
                rank.report;

            reportSelect.appendChild(
                option
            );
        }
    );


    reportSelect.addEventListener(
        "change",
        async () => {
            rank.report =
                reportSelect.value;

            rank.table =
                "";

            rank.levelSelections =
                [];

            rank.metric =
                "PPP";


            await prepareAdvancedDefinition(
                rank
            );

            renderAdvancedRankBuilder();

            updateAdvancedQueryDescription();
        }
    );


    reportField.appendChild(
        reportSelect
    );

    controls.appendChild(
        reportField
    );


    /* ========================================================
       SIDE
    ======================================================== */

    const sideField =
        createAdvancedField(
            "Side"
        );

    const sideSelect =
        document.createElement(
            "select"
        );

    sideSelect.className =
        "control";


    [
        [
            "offense",
            "Offense"
        ],

        [
            "defense",
            "Defense"
        ]
    ].forEach(
        ([value, label]) => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                value;

            option.textContent =
                label;

            option.selected =
                value ===
                rank.side;

            sideSelect.appendChild(
                option
            );
        }
    );


    sideSelect.addEventListener(
        "change",
        async () => {
            rank.side =
                sideSelect.value;

            rank.table =
                "";

            rank.levelSelections =
                [];

            rank.metric =
                "PPP";


            await prepareAdvancedDefinition(
                rank
            );

            renderAdvancedRankBuilder();

            updateAdvancedQueryDescription();
        }
    );


    sideField.appendChild(
        sideSelect
    );

    controls.appendChild(
        sideField
    );


    /* ========================================================
       TABLE
    ======================================================== */

    const tableField =
        createAdvancedField(
            "Table"
        );

    const tableSelect =
        document.createElement(
            "select"
        );

    tableSelect.className =
        "control";


    (
        rank.data
            ?.table_names || []
    ).forEach(
        tableName => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                tableName;

            option.textContent =
                tableName;

            option.selected =
                tableName ===
                rank.table;

            tableSelect.appendChild(
                option
            );
        }
    );


    tableSelect.addEventListener(
        "change",
        () => {
            rank.table =
                tableSelect.value;

            rank.levelSelections =
                [];

            normalizeAdvancedDefinition(
                rank
            );

            renderAdvancedRankBuilder();

            updateAdvancedQueryDescription();
        }
    );


    tableField.appendChild(
        tableSelect
    );

    controls.appendChild(
        tableField
    );


    /* ========================================================
       HIERARCHY
    ======================================================== */

    appendAdvancedHierarchyControls(
        rank,
        controls,
        () => {
            renderAdvancedRankBuilder();

            updateAdvancedQueryDescription();
        }
    );


    /* ========================================================
       RANK STAT
    ======================================================== */

    const metricField =
        createAdvancedField(
            "Rank Stat"
        );

    const metricSelect =
        document.createElement(
            "select"
        );

    metricSelect.className =
        "control";


    getAdvancedDefinitionMetrics(
        rank
    ).forEach(
        metric => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                metric;

            option.textContent =
                metric;

            option.selected =
                metric ===
                rank.metric;

            metricSelect.appendChild(
                option
            );
        }
    );


    metricSelect.addEventListener(
        "change",
        () => {
            rank.metric =
                metricSelect.value;

            updateAdvancedQueryDescription();
        }
    );


    metricField.appendChild(
        metricSelect
    );

    controls.appendChild(
        metricField
    );


    /* ========================================================
       DIRECTION
    ======================================================== */

    const directionField =
        createAdvancedField(
            "Direction"
        );

    const directionSelect =
        document.createElement(
            "select"
        );

    directionSelect.className =
        "control";


    [
        [
            "desc",
            "Highest to Lowest"
        ],

        [
            "asc",
            "Lowest to Highest"
        ]
    ].forEach(
        ([value, label]) => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                value;

            option.textContent =
                label;

            option.selected =
                value ===
                rank.direction;

            directionSelect.appendChild(
                option
            );
        }
    );


    directionSelect.addEventListener(
        "change",
        () => {
            rank.direction =
                directionSelect.value;

            updateAdvancedQueryDescription();
        }
    );


    directionField.appendChild(
        directionSelect
    );

    controls.appendChild(
        directionField
    );


    /* ========================================================
       OPTIONAL PRIMARY MIN
    ======================================================== */

    const minField =
        createAdvancedField(
            "Minimum"
        );

    const minInput =
        document.createElement(
            "input"
        );

    minInput.type =
        "number";

    minInput.step =
        "any";

    minInput.className =
        "control";

    minInput.placeholder =
        "None";

    minInput.value =
        rank.min ?? "";


    minInput.addEventListener(
        "input",
        () => {
            rank.min =
                minInput.value === ""
                    ? null
                    : Number(
                        minInput.value
                    );

            updateAdvancedQueryDescription();
        }
    );


    minField.appendChild(
        minInput
    );

    controls.appendChild(
        minField
    );


    /* ========================================================
       OPTIONAL PRIMARY MAX
    ======================================================== */

    const maxField =
        createAdvancedField(
            "Maximum"
        );

    const maxInput =
        document.createElement(
            "input"
        );

    maxInput.type =
        "number";

    maxInput.step =
        "any";

    maxInput.className =
        "control";

    maxInput.placeholder =
        "None";

    maxInput.value =
        rank.max ?? "";


    maxInput.addEventListener(
        "input",
        () => {
            rank.max =
                maxInput.value === ""
                    ? null
                    : Number(
                        maxInput.value
                    );

            updateAdvancedQueryDescription();
        }
    );


    maxField.appendChild(
        maxInput
    );

    controls.appendChild(
        maxField
    );


    advancedRankBuilder.appendChild(
        controls
    );


    const footer =
        document.createElement(
            "div"
        );

    footer.className =
        "advanced-condition-footer";

    footer.textContent =
        `${getAdvancedExactRows(rank).length} player/team rows available for this ranking category`;


    advancedRankBuilder.appendChild(
        footer
    );
}


/* ============================================================
   FILTER CARDS
============================================================ */

function renderAdvancedFilters() {
    advancedFilters.innerHTML =
        "";


    if (
        advancedLeaderboardState
            .filters.length === 0
    ) {
        advancedFilters.innerHTML = `
            <div class="advanced-no-filters">
                No additional filters.
                Every player with the selected ranking stat can qualify.
            </div>
        `;

        return;
    }


    advancedLeaderboardState
        .filters
        .forEach(
            (
                filter,
                index
            ) => {
                advancedFilters.appendChild(
                    buildAdvancedFilterCard(
                        filter,
                        index
                    )
                );
            }
        );
}


function buildAdvancedFilterCard(
    filter,
    index
) {
    const card =
        document.createElement(
            "section"
        );

    card.className =
        "advanced-condition-card";


    const header =
        document.createElement(
            "div"
        );

    header.className =
        "advanced-condition-header";


    const title =
        document.createElement(
            "div"
        );


    title.innerHTML = `
        <strong>
            Filter ${index + 1}
        </strong>

        <span>
            ${escapeHtml(
                getAdvancedDefinitionLabel(
                    filter
                )
            )}
        </span>
    `;


    const removeButton =
        document.createElement(
            "button"
        );

    removeButton.type =
        "button";

    removeButton.className =
        "advanced-condition-remove";

    removeButton.textContent =
        "Remove";


    removeButton.addEventListener(
        "click",
        () => {
            advancedLeaderboardState
                .filters =
                    advancedLeaderboardState
                        .filters
                        .filter(
                            item =>
                                item.id !==
                                filter.id
                        );


            renderAdvancedFilters();

            updateAdvancedQueryDescription();
        }
    );


    header.appendChild(
        title
    );

    header.appendChild(
        removeButton
    );

    card.appendChild(
        header
    );


    const controls =
        document.createElement(
            "div"
        );

    controls.className =
        "advanced-condition-controls";


    /* ========================================================
       REPORT
    ======================================================== */

    const reportField =
        createAdvancedField(
            "Report"
        );

    const reportSelect =
        document.createElement(
            "select"
        );

    reportSelect.className =
        "control";


    [
        [
            "play_types",
            "Play Types"
        ],

        [
            "shot_types",
            "Shot Types"
        ]
    ].forEach(
        ([value, label]) => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                value;

            option.textContent =
                label;

            option.selected =
                value ===
                filter.report;

            reportSelect.appendChild(
                option
            );
        }
    );


    reportSelect.addEventListener(
        "change",
        async () => {
            filter.report =
                reportSelect.value;

            filter.table =
                "";

            filter.levelSelections =
                [];

            filter.metric =
                "POSS";


            await prepareAdvancedDefinition(
                filter
            );

            renderAdvancedFilters();

            updateAdvancedQueryDescription();
        }
    );


    reportField.appendChild(
        reportSelect
    );

    controls.appendChild(
        reportField
    );


    /* ========================================================
       SIDE
    ======================================================== */

    const sideField =
        createAdvancedField(
            "Side"
        );

    const sideSelect =
        document.createElement(
            "select"
        );

    sideSelect.className =
        "control";


    [
        [
            "offense",
            "Offense"
        ],

        [
            "defense",
            "Defense"
        ]
    ].forEach(
        ([value, label]) => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                value;

            option.textContent =
                label;

            option.selected =
                value ===
                filter.side;

            sideSelect.appendChild(
                option
            );
        }
    );


    sideSelect.addEventListener(
        "change",
        async () => {
            filter.side =
                sideSelect.value;

            filter.table =
                "";

            filter.levelSelections =
                [];

            filter.metric =
                "POSS";


            await prepareAdvancedDefinition(
                filter
            );

            renderAdvancedFilters();

            updateAdvancedQueryDescription();
        }
    );


    sideField.appendChild(
        sideSelect
    );

    controls.appendChild(
        sideField
    );


    /* ========================================================
       TABLE
    ======================================================== */

    const tableField =
        createAdvancedField(
            "Table"
        );

    const tableSelect =
        document.createElement(
            "select"
        );

    tableSelect.className =
        "control";


    (
        filter.data
            ?.table_names || []
    ).forEach(
        tableName => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                tableName;

            option.textContent =
                tableName;

            option.selected =
                tableName ===
                filter.table;

            tableSelect.appendChild(
                option
            );
        }
    );


    tableSelect.addEventListener(
        "change",
        () => {
            filter.table =
                tableSelect.value;

            filter.levelSelections =
                [];

            normalizeAdvancedDefinition(
                filter
            );

            renderAdvancedFilters();

            updateAdvancedQueryDescription();
        }
    );


    tableField.appendChild(
        tableSelect
    );

    controls.appendChild(
        tableField
    );


    /* ========================================================
       HIERARCHY
    ======================================================== */

    appendAdvancedHierarchyControls(
        filter,
        controls,
        () => {
            renderAdvancedFilters();

            updateAdvancedQueryDescription();
        }
    );


    /* ========================================================
       FILTER STAT
    ======================================================== */

    const metricField =
        createAdvancedField(
            "Stat"
        );

    const metricSelect =
        document.createElement(
            "select"
        );

    metricSelect.className =
        "control";


    getAdvancedDefinitionMetrics(
        filter
    ).forEach(
        metric => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                metric;

            option.textContent =
                metric;

            option.selected =
                metric ===
                filter.metric;

            metricSelect.appendChild(
                option
            );
        }
    );


    metricSelect.addEventListener(
        "change",
        () => {
            filter.metric =
                metricSelect.value;

            updateAdvancedQueryDescription();
        }
    );


    metricField.appendChild(
        metricSelect
    );

    controls.appendChild(
        metricField
    );


    /* ========================================================
       OPERATOR
    ======================================================== */

    const operatorField =
        createAdvancedField(
            "Condition"
        );

    const operatorSelect =
        document.createElement(
            "select"
        );

    operatorSelect.className =
        "control advanced-operator";


    [
        ">=",
        ">",
        "<=",
        "<",
        "="
    ].forEach(
        operator => {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                operator;

            option.textContent =
                operator;

            option.selected =
                operator ===
                filter.operator;

            operatorSelect.appendChild(
                option
            );
        }
    );


    operatorSelect.addEventListener(
        "change",
        () => {
            filter.operator =
                operatorSelect.value;

            updateAdvancedQueryDescription();
        }
    );


    operatorField.appendChild(
        operatorSelect
    );

    controls.appendChild(
        operatorField
    );


    /* ========================================================
       VALUE
    ======================================================== */

    const valueField =
        createAdvancedField(
            "Value"
        );

    const valueInput =
        document.createElement(
            "input"
        );

    valueInput.type =
        "number";

    valueInput.step =
        "any";

    valueInput.className =
        "control advanced-value";

    valueInput.value =
        filter.value;


    valueInput.addEventListener(
        "input",
        () => {
            filter.value =
                valueInput.value;

            updateAdvancedQueryDescription();
        }
    );


    valueField.appendChild(
        valueInput
    );

    controls.appendChild(
        valueField
    );


    card.appendChild(
        controls
    );


    const footer =
        document.createElement(
            "div"
        );

    footer.className =
        "advanced-condition-footer";

    footer.textContent =
        `${getAdvancedExactRows(filter).length} player/team rows available at this exact path`;


    card.appendChild(
        footer
    );


    return card;
}


/* ============================================================
   LABELS
============================================================ */

function getAdvancedDefinitionLabel(
    definition
) {
    const levels =
        definition
            .levelSelections
            .filter(Boolean);

    if (
        levels.length > 0
    ) {
        return levels.join(
            " > "
        );
    }

    return (
        definition.table ||
        "No category selected"
    );
}


/* ============================================================
   FILTER COMPARISON
============================================================ */

function advancedValueMatches(
    value,
    operator,
    threshold
) {
    switch (
        operator
    ) {
        case ">=":
            return (
                value >= threshold
            );

        case ">":
            return (
                value > threshold
            );

        case "<=":
            return (
                value <= threshold
            );

        case "<":
            return (
                value < threshold
            );

        case "=":
            return (
                value === threshold
            );

        default:
            return false;
    }
}


function getAdvancedPlayerKey(
    row
) {
    return (
        `${row.PLAYER}|||${row.TEAM}`
    );
}


/* ============================================================
   PRIMARY RANK MAP
============================================================ */

function buildAdvancedRankMap() {
    const rank =
        advancedLeaderboardState.rank;

    const rows =
        getAdvancedExactRows(
            rank
        );

    const map =
        new Map();


    rows.forEach(
        row => {
            const rankValue =
                getSortableValue(
                    row[
                        rank.metric
                    ]
                );


            if (
                typeof rankValue !==
                "number"
            ) {
                return;
            }


            if (
                rank.min !== null &&
                rank.min !== undefined &&
                rank.min !== "" &&
                rankValue <
                Number(rank.min)
            ) {
                return;
            }


            if (
                rank.max !== null &&
                rank.max !== undefined &&
                rank.max !== "" &&
                rankValue >
                Number(rank.max)
            ) {
                return;
            }


            const key =
                getAdvancedPlayerKey(
                    row
                );


            if (
                !map.has(
                    key
                )
            ) {
                map.set(
                    key,
                    {
                        row,
                        value:
                            rankValue
                    }
                );
            }
        }
    );


    return map;
}


/* ============================================================
   FILTER MAP
============================================================ */

function buildAdvancedFilterMap(
    filter
) {
    const threshold =
        Number(
            filter.value
        );


    if (
        !filter.metric ||
        Number.isNaN(
            threshold
        )
    ) {
        return new Map();
    }


    const rows =
        getAdvancedExactRows(
            filter
        );

    const map =
        new Map();


    rows.forEach(
        row => {
            const value =
                getSortableValue(
                    row[
                        filter.metric
                    ]
                );


            if (
                typeof value !==
                "number"
            ) {
                return;
            }


            if (
                !advancedValueMatches(
                    value,
                    filter.operator,
                    threshold
                )
            ) {
                return;
            }


            const key =
                getAdvancedPlayerKey(
                    row
                );


            if (
                !map.has(
                    key
                )
            ) {
                map.set(
                    key,
                    {
                        row,
                        value
                    }
                );
            }
        }
    );


    return map;
}


/* ============================================================
   RUN ADVANCED QUERY
============================================================ */

function runAdvancedLeaderboardQuery() {
    const rank =
        advancedLeaderboardState.rank;


    if (
        !rank.metric
    ) {
        advancedLeaderboardState.results =
            [];

        renderAdvancedLeaderboardResults();

        return;
    }


    const rankMap =
        buildAdvancedRankMap();


    const filterMaps =
        advancedLeaderboardState
            .filters
            .map(
                filter =>
                    buildAdvancedFilterMap(
                        filter
                    )
            );


    let survivingKeys =
        new Set(
            rankMap.keys()
        );


    filterMaps.forEach(
        map => {
            survivingKeys =
                new Set(
                    [
                        ...survivingKeys
                    ].filter(
                        key =>
                            map.has(
                                key
                            )
                    )
                );
        }
    );


    let results =
        [
            ...survivingKeys
        ].map(
            key => {
                const rankEntry =
                    rankMap.get(
                        key
                    );


                const filterValues =
                    {};


                advancedLeaderboardState
                    .filters
                    .forEach(
                        (
                            filter,
                            index
                        ) => {
                            filterValues[
                                filter.id
                            ] =
                                filterMaps[
                                    index
                                ]
                                .get(
                                    key
                                )
                                ?.value ??
                                null;
                        }
                    );


                return {
                    PLAYER:
                        rankEntry
                            .row
                            .PLAYER,

                    TEAM:
                        rankEntry
                            .row
                            .TEAM,

                    rankValue:
                        rankEntry
                            .value,

                    filterValues
                };
            }
        );


    results.sort(
        (a, b) => {
            if (
                a.rankValue !==
                b.rankValue
            ) {
                return (
                    rank.direction ===
                    "desc"
                        ? b.rankValue -
                            a.rankValue
                        : a.rankValue -
                            b.rankValue
                );
            }


            return a.PLAYER.localeCompare(
                b.PLAYER
            );
        }
    );


    advancedLeaderboardState.results =
        results.map(
            (
                row,
                index
            ) => ({
                RANK:
                    index + 1,

                ...row
            })
        );


    renderAdvancedSummary();

    renderAdvancedLeaderboardResults();
}


/* ============================================================
   SUMMARY
============================================================ */

function updateAdvancedQueryDescription() {
    if (
        !advancedQueryDescription
    ) {
        return;
    }


    const rank =
        advancedLeaderboardState.rank;


    let text =
        `Rank by `
        +
        `${getAdvancedDefinitionLabel(
            rank
        )} `
        +
        `${rank.metric || ""}`;


    if (
        rank.min !== null &&
        rank.min !== ""
    ) {
        text +=
            ` • min ${rank.min}`;
    }


    if (
        rank.max !== null &&
        rank.max !== ""
    ) {
        text +=
            ` • max ${rank.max}`;
    }


    const filterCount =
        advancedLeaderboardState
            .filters.length;


    text +=
        ` • ${filterCount} additional `
        +
        `${filterCount === 1
            ? "filter"
            : "filters"
        }`;


    advancedQueryDescription.textContent =
        text;
}


function renderAdvancedSummary() {
    advancedSummary.innerHTML =
        "";


    const rank =
        advancedLeaderboardState.rank;


    const rankPill =
        document.createElement(
            "span"
        );

    rankPill.className =
        "leaderboard-pill";

    rankPill.textContent =
        `Rank: `
        +
        `${getAdvancedDefinitionLabel(rank)} `
        +
        `${rank.metric}`;


    advancedSummary.appendChild(
        rankPill
    );


    advancedLeaderboardState
        .filters
        .forEach(
            (
                filter,
                index
            ) => {
                const pill =
                    document.createElement(
                        "span"
                    );

                pill.className =
                    "leaderboard-pill";

                pill.textContent =
                    `Filter ${index + 1}: `
                    +
                    `${getAdvancedDefinitionLabel(
                        filter
                    )} `
                    +
                    `${filter.metric} `
                    +
                    `${filter.operator} `
                    +
                    `${filter.value}`;


                advancedSummary.appendChild(
                    pill
                );
            }
        );


    const resultPill =
        document.createElement(
            "span"
        );

    resultPill.className =
        "leaderboard-pill";

    resultPill.textContent =
        `${advancedLeaderboardState.results.length} results`;


    advancedSummary.appendChild(
        resultPill
    );


    advancedSummary.classList.remove(
        "hidden"
    );
}


/* ============================================================
   RESULTS
============================================================ */

function renderAdvancedLeaderboardResults() {
    advancedResults.innerHTML =
        "";


    const results =
        advancedLeaderboardState
            .results;


    if (
        !results ||
        results.length === 0
    ) {
        advancedResults.innerHTML = `
            <div class="empty-state">
                <p>
                    No players satisfy the current query.
                </p>
            </div>
        `;

        return;
    }


    const rank =
        advancedLeaderboardState.rank;

    const filters =
        advancedLeaderboardState.filters;


    const block =
        document.createElement(
            "section"
        );

    block.className =
        "report-table-block";


    const header =
        document.createElement(
            "div"
        );

    header.className =
        "report-table-title";


    const title =
        document.createElement(
            "span"
        );

    title.textContent =
        "Advanced Leaderboard Results";


    const count =
        document.createElement(
            "span"
        );

    count.className =
        "report-table-count";

    count.textContent =
        `${results.length} rows`;


    header.appendChild(
        title
    );

    header.appendChild(
        count
    );

    block.appendChild(
        header
    );


    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.className =
        "table-scroll";


    const table =
        document.createElement(
            "table"
        );

    table.className =
        "data-table leaderboard-table";


    const thead =
        document.createElement(
            "thead"
        );

    const headerRow =
        document.createElement(
            "tr"
        );


    const headers = [
        {
            label:
                "RANK",
            className:
                "leaderboard-rank-col"
        },

        {
            label:
                "PLAYER",
            className:
                "leaderboard-player-col"
        },

        {
            label:
                "TEAM",
            className:
                "leaderboard-team-col"
        },

        {
            label:
                `${getAdvancedDefinitionLabel(
                    rank
                )} ${rank.metric}`,

            className:
                "leaderboard-number-col"
        },

        ...filters.map(
            filter => ({
                label:
                    `${getAdvancedDefinitionLabel(
                        filter
                    )} ${filter.metric}`,

                className:
                    "leaderboard-number-col"
            })
        )
    ];


    headers.forEach(
        headerInfo => {
            const th =
                document.createElement(
                    "th"
                );

            th.textContent =
                headerInfo.label;

            th.className =
                headerInfo.className;

            headerRow.appendChild(
                th
            );
        }
    );


    thead.appendChild(
        headerRow
    );

    table.appendChild(
        thead
    );


    const tbody =
        document.createElement(
            "tbody"
        );


    results.forEach(
        result => {
            const tr =
                document.createElement(
                    "tr"
                );


            const values = [
                {
                    value:
                        result.RANK,
                    className:
                        "leaderboard-rank-col",
                    metric:
                        "RANK"
                },

                {
                    value:
                        result.PLAYER,
                    className:
                        "leaderboard-player-col",
                    metric:
                        "PLAYER"
                },

                {
                    value:
                        result.TEAM,
                    className:
                        "leaderboard-team-col",
                    metric:
                        "TEAM"
                },

                {
                    value:
                        result.rankValue,
                    className:
                        "leaderboard-number-col",
                    metric:
                        rank.metric
                },

                ...filters.map(
                    filter => ({
                        value:
                            result
                                .filterValues[
                                    filter.id
                                ],

                        className:
                            "leaderboard-number-col",

                        metric:
                            filter.metric
                    })
                )
            ];


            values.forEach(
                item => {
                    const td =
                        document.createElement(
                            "td"
                        );

                    td.className =
                        item.className;

                    td.textContent =
                        formatValue(
                            item.value,
                            item.metric
                        );

                    tr.appendChild(
                        td
                    );
                }
            );


            tbody.appendChild(
                tr
            );
        }
    );


    table.appendChild(
        tbody
    );

    wrapper.appendChild(
        table
    );

    block.appendChild(
        wrapper
    );

    advancedResults.appendChild(
        block
    );
}


/* ============================================================
   DOWNLOAD
============================================================ */

function downloadAdvancedLeaderboardCsv() {
    const results =
        advancedLeaderboardState
            .results;

    if (
        !results ||
        results.length === 0
    ) {
        return;
    }


    const rank =
        advancedLeaderboardState.rank;

    const filters =
        advancedLeaderboardState.filters;


    const rankColumn =
        `${getAdvancedDefinitionLabel(
            rank
        )} ${rank.metric}`;


    const filterColumns =
        filters.map(
            filter =>
                `${getAdvancedDefinitionLabel(
                    filter
                )} ${filter.metric}`
        );


    const rows =
        results.map(
            result => {
                const row = {
                    RANK:
                        result.RANK,

                    PLAYER:
                        result.PLAYER,

                    TEAM:
                        result.TEAM,

                    [rankColumn]:
                        result.rankValue
                };


                filters.forEach(
                    (
                        filter,
                        index
                    ) => {
                        row[
                            filterColumns[
                                index
                            ]
                        ] =
                            result
                                .filterValues[
                                    filter.id
                                ];
                    }
                );


                return row;
            }
        );


    downloadCsv(
        "advanced_synergy_leaderboard.csv",
        rows,
        Object.keys(
            rows[0]
        )
    );
}


/* ============================================================
   INITIALIZATION
============================================================ */

async function initializeAdvancedLeaderboard() {
    advancedLoading.classList.remove(
        "hidden"
    );


    try {
        await prepareAdvancedDefinition(
            advancedLeaderboardState.rank
        );


        await Promise.all(
            advancedLeaderboardState
                .filters
                .map(
                    filter =>
                        prepareAdvancedDefinition(
                            filter
                        )
                )
        );


        renderAdvancedRankBuilder();

        renderAdvancedFilters();

        updateAdvancedQueryDescription();


    } finally {
        advancedLoading.classList.add(
            "hidden"
        );
    }
}


/* ============================================================
   EVENTS
============================================================ */

leaderboardSimpleMode.addEventListener(
    "click",
    () => {
        setLeaderboardMode(
            "simple"
        );
    }
);


leaderboardAdvancedMode.addEventListener(
    "click",
    async () => {
        setLeaderboardMode(
            "advanced"
        );

        await initializeAdvancedLeaderboard();
    }
);


advancedAddFilter.addEventListener(
    "click",
    async () => {
        const filter =
            createAdvancedFilter();


        advancedLeaderboardState
            .filters
            .push(
                filter
            );


        await prepareAdvancedDefinition(
            filter
        );


        renderAdvancedFilters();

        updateAdvancedQueryDescription();
    }
);


advancedRun.addEventListener(
    "click",
    () => {
        runAdvancedLeaderboardQuery();
    }
);


advancedDownload.addEventListener(
    "click",
    () => {
        downloadAdvancedLeaderboardCsv();
    }
);

/* ============================================================
   CSV DOWNLOAD
============================================================ */

function sanitizeFilenamePart(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}


function csvEscape(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    const text = String(value);

    if (
        text.includes(",") ||
        text.includes('"') ||
        text.includes("\n") ||
        text.includes("\r")
    ) {
        return `"${text.replaceAll('"', '""')}"`;
    }

    return text;
}


function downloadCsv(
    filename,
    rows,
    columns
) {
    const lines = [];

    lines.push(
        columns
            .map(csvEscape)
            .join(",")
    );

    rows.forEach(row => {
        lines.push(
            columns
                .map(column =>
                    csvEscape(
                        row[column]
                    )
                )
                .join(",")
        );
    });

    /*
     * UTF-8 BOM makes accented names such as Montréal
     * display correctly when opened directly in Excel.
     */
    const csvContent =
        "\uFEFF" +
        lines.join("\r\n");

    const blob = new Blob(
        [csvContent],
        {
            type: "text/csv;charset=utf-8;"
        }
    );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}


/* ============================================================
   HIERARCHY CSV
============================================================ */

function flattenHierarchyForCsv(nodes) {
    const rows = [];

    function walk(nodeList) {
        nodeList.forEach(node => {
            rows.push({
                STAT:
                    node.stat ?? "",

                DEPTH:
                    node.depth ?? "",

                PARENT:
                    node.parent ?? "",

                PATH:
                    node.path ?? "",

                ...(
                    node.stats || {}
                )
            });

            if (
                node.children &&
                node.children.length > 0
            ) {
                walk(
                    node.children
                );
            }
        });
    }

    walk(nodes);

    return rows;
}


function downloadHierarchyTableCsv(
    reportTable
) {
    const rows =
        flattenHierarchyForCsv(
            reportTable.rows || []
        );

    if (rows.length === 0) {
        return;
    }

    /*
     * Use the same metric ordering as the HTML table.
     */
    const fakeFlatRows = rows.map(row => ({
        node: {
            stats: Object.fromEntries(
                Object.entries(row)
                    .filter(([key]) =>
                        ![
                            "STAT",
                            "DEPTH",
                            "PARENT",
                            "PATH"
                        ].includes(key)
                    )
            )
        }
    }));

    const metricColumns =
        getMetricColumns(
            fakeFlatRows
        );

    const columns = [
        "STAT",
        "DEPTH",
        "PARENT",
        "PATH",
        ...metricColumns
    ];

    const playerPart =
        sanitizeFilenamePart(
            selectedPlayer?.player
        );

    const teamPart =
        sanitizeFilenamePart(
            selectedPlayer?.team
        );

    const reportPart =
        sanitizeFilenamePart(
            selectedReport
        );

    const sidePart =
        sanitizeFilenamePart(
            selectedSide
        );

    const tablePart =
        sanitizeFilenamePart(
            reportTable.table
        );

    const filename = [
        playerPart,
        teamPart,
        reportPart,
        sidePart,
        tablePart
    ]
        .filter(Boolean)
        .join("__")
        + ".csv";

    downloadCsv(
        filename,
        rows,
        columns
    );
}


/* ============================================================
   TEAM CSV
============================================================ */

function downloadTeamTableCsv(
    records
) {
    if (
        !Array.isArray(records) ||
        records.length === 0
    ) {
        return;
    }

    const columns = [
        ...new Set(
            records.flatMap(
                record =>
                    Object.keys(record)
            )
        )
    ];

    /*
     * Put the most useful identity columns first.
     */
    const preferred = [
        "TEAM",
        "SEASON",
        "PLAYER",
        "GP",
        "POSS",
        "PTS",
        "PPP",
        "TS%",
        "FG%",
        "EFG%",
        "3 FG%",
        "AST",
        "AST/TO",
        "TO",
        "TO%",
        "TOT REB",
        "OFF REB",
        "DEF REB",
        "STL",
        "BLK",
        "GM SCORE",
        "OFFENSIVE ROLE"
    ];

    const orderedColumns = [
        ...preferred.filter(
            column =>
                columns.includes(column)
        ),

        ...columns.filter(
            column =>
                !preferred.includes(column)
        )
    ];

    const filename =
        `${sanitizeFilenamePart(
            selectedTeam?.team
        )}__cumulative_box.csv`;

    downloadCsv(
        filename,
        records,
        orderedColumns
    );
}
/* ============================================================
   FORMATTING
============================================================ */

function formatValue(
    value,
    column
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "—";
    }

    if (
        typeof value === "number"
    ) {
        if (
            column.includes("%") ||
            column === "PPP RANK"
        ) {
            return Number.isInteger(value)
                ? value.toString()
                : value.toFixed(1);
        }

        if (
            column === "PPP" ||
            column === "PPS" ||
            column === "FTA/FGA" ||
            column === "3PA/FGA" ||
            column === "AST/TO"
        ) {
            return value.toFixed(3)
                .replace(/0+$/, "")
                .replace(/\.$/, "");
        }

        return Number.isInteger(value)
            ? value.toString()
            : value.toFixed(2);
    }

    return String(value);
}


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* ============================================================
   START
============================================================ */

