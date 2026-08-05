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

/* ============================================================
   DOM
============================================================ */

const seasonLabel = document.getElementById("seasonLabel");
const dataStatus = document.getElementById("dataStatus");

const playersView = document.getElementById("playersView");
const teamsView = document.getElementById("teamsView");

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

document.querySelectorAll(".view-tab").forEach(button => {
    button.addEventListener("click", () => {
        document
            .querySelectorAll(".view-tab")
            .forEach(item => item.classList.remove("active"));

        button.classList.add("active");

        const view = button.dataset.view;

        playersView.classList.toggle(
            "active",
            view === "players"
        );

        teamsView.classList.toggle(
            "active",
            view === "teams"
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
   TEAM SELECT
============================================================ */

function populateTeamSelect() {
    // ========================================================
    // ALL TEAMS
    // ========================================================

    const allTeamsOption =
        document.createElement("option");

    allTeamsOption.value =
        "__all__";

    allTeamsOption.textContent =
        "All Teams";

    teamSelect.appendChild(
        allTeamsOption
    );


    // ========================================================
    // INDIVIDUAL TEAMS
    // ========================================================

    manifest.teams
        .slice()
        .sort((a, b) =>
            a.team.localeCompare(
                b.team
            )
        )
        .forEach(team => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                team.key;

            option.textContent =
                team.team;

            teamSelect.appendChild(
                option
            );
        });
}


teamSelect.addEventListener(
    "change",
    async () => {

        const key =
            teamSelect.value;

        teamSortState = {
            column: null,
            direction: null
        };
        resetTeamFilter();
        let teamFilterState = {
            column: null,
            min: null,
            max: null
        };


        // ====================================================
        // NOTHING SELECTED
        // ====================================================

        if (!key) {

            selectedTeam =
                null;

            teamEmptyState.classList.remove(
                "hidden"
            );

            teamContent.classList.add(
                "hidden"
            );

            return;
        }


        // ====================================================
        // ALL TEAMS
        // ====================================================

        if (
            key === "__all__"
        ) {

            selectedTeam = {
                key:
                    "__all__",

                team:
                    "All Teams",

                allTeams:
                    true,

                cumulative_box:
                    manifest.combined[
                        "team_cumulative_box.json"
                    ]
            };

        }

        // ====================================================
        // INDIVIDUAL TEAM
        // ====================================================

        else {

            selectedTeam =
                manifest.teams.find(
                    team =>
                        team.key === key
                ) || null;
        }


        if (!selectedTeam) {

            teamEmptyState.classList.remove(
                "hidden"
            );

            teamContent.classList.add(
                "hidden"
            );

            return;
        }


        await loadTeamReport();
    }
);


/* ============================================================
   LOAD TEAM
============================================================ */

async function loadTeamReport() {
    teamEmptyState.classList.add("hidden");
    teamContent.classList.remove("hidden");

    selectedTeamName.textContent =
        selectedTeam.team;

    teamLoading.classList.remove("hidden");
    teamTable.innerHTML = "";

    try {
        const data = await fetchJson(
            `${DATA_ROOT}/${selectedTeam.cumulative_box}`
        );

        renderTeamTable(data);

    } catch (error) {
        console.error(error);

        teamTable.innerHTML = `
            <div class="error-box">
                ${escapeHtml(error.message)}
            </div>
        `;

    } finally {
        teamLoading.classList.add("hidden");
    }
}


/* ============================================================
   TEAM TABLE
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

initialize();