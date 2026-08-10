/* ============================================================
   TEAM BROWSER
============================================================ */

let selectedTeamReport = "play_types";
let selectedTeamSide = "offense";
let selectedTeamMetric = "PTS";
let currentTeamBreakdown = null;

const teamDataCache = {};

const teamReportTabsEl =
    document.getElementById("teamReportTabs");

const teamSideControlsEl =
    document.getElementById("teamSideControls");

const teamMetricBarEl =
    document.getElementById("teamMetricBar");

const teamMetricSelectEl =
    document.getElementById("teamMetricSelect");

const teamSynergyContentEl =
    document.getElementById("teamSynergyContent");

const teamCumulativeContentEl =
    document.getElementById("teamCumulativeContent");

const teamGameBreakdownEl =
    document.getElementById("teamGameBreakdown");

const teamReportTablesEl =
    document.getElementById("teamReportTables");


function populateTeamSelect() {
    teamSelect.innerHTML = `
        <option value="">Select team...</option>
        <option value="__all__">All Teams</option>
    `;

    manifest.teams
        .slice()
        .sort((a, b) =>
            a.team.localeCompare(b.team)
        )
        .forEach(team => {
            const option =
                document.createElement("option");

            option.value = team.key;
            option.textContent = team.team;

            teamSelect.appendChild(option);
        });
}


function getTeamReportLabel(report) {
    return {
        play_types: "Play Types",
        shot_types: "Shot Types",
        cumulative_box: "Cumulative Box"
    }[report] || report;
}


function syncTeamControls() {
    const isAllTeams =
        selectedTeam?.allTeams === true;

    if (isAllTeams) {
        selectedTeamReport =
            "cumulative_box";
    }

    teamReportTabsEl
        .querySelectorAll(
            "[data-team-report]"
        )
        .forEach(button => {
            const report =
                button.dataset.teamReport;

            button.classList.toggle(
                "active",
                report ===
                    selectedTeamReport
            );

            button.disabled = (
                isAllTeams &&
                report !==
                    "cumulative_box"
            );
        });

    teamSideControlsEl
        .querySelectorAll(
            "[data-team-side]"
        )
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.teamSide ===
                    selectedTeamSide
            );
        });

    const showSynergy =
        selectedTeamReport !==
        "cumulative_box";

    teamSideControlsEl.classList.toggle(
        "hidden",
        !showSynergy
    );

    teamMetricBarEl.classList.toggle(
        "hidden",
        !showSynergy
    );

    teamSynergyContentEl.classList.toggle(
        "hidden",
        !showSynergy
    );

    teamCumulativeContentEl.classList.toggle(
        "hidden",
        showSynergy
    );
}


async function fetchTeamData(path) {
    if (!path) {
        throw new Error(
            "The selected team report is missing from the manifest."
        );
    }

    if (!teamDataCache[path]) {
        teamDataCache[path] =
            fetchJson(
                `${DATA_ROOT}/${path}`
            );
    }

    return teamDataCache[path];
}


function getSelectedTeamReportFiles() {
    return (
        selectedTeam
            ?.reports
            ?.[selectedTeamReport]
            ?.[selectedTeamSide]
        || null
    );
}


async function loadSelectedTeamView() {
    teamEmptyState.classList.add(
        "hidden"
    );

    teamContent.classList.remove(
        "hidden"
    );

    selectedTeamName.textContent =
        selectedTeam.team;

    syncTeamControls();

    teamLoading.classList.remove(
        "hidden"
    );

    teamGameBreakdownEl.innerHTML = "";
    teamReportTablesEl.innerHTML = "";
    teamTable.innerHTML = "";

    try {

        if (
            selectedTeamReport ===
            "cumulative_box"
        ) {

            const data =
                await fetchTeamData(
                    selectedTeam
                        .cumulative_box
                );

            currentTeamBreakdown =
                null;

            renderTeamTable(
                data
            );

        } else {

            await loadTeamSynergyReport();

        }

    } catch (error) {

        console.error(
            error
        );

        const target = (
            selectedTeamReport ===
            "cumulative_box"
                ? teamTable
                : teamGameBreakdownEl
        );

        target.innerHTML = `
            <div class="error-box">
                ${escapeHtml(
                    error.message
                )}
            </div>
        `;

    } finally {

        teamLoading.classList.add(
            "hidden"
        );

    }
}


async function loadTeamSynergyReport() {
    const files =
        getSelectedTeamReportFiles();

    if (!files) {
        throw new Error(
            `${getTeamReportLabel(
                selectedTeamReport
            )} ${selectedTeamSide} ` +
            `is not available for ${selectedTeam.team}.`
        );
    }

    const [
        reportData,
        breakdownData
    ] = await Promise.all([
        fetchTeamData(
            files.report
        ),

        fetchTeamData(
            files.game_breakdown
        )
    ]);

    currentTeamBreakdown =
        breakdownData;

    populateTeamMetricSelect(
        breakdownData
    );

    renderTeamGameBreakdown(
        breakdownData
    );

    renderTeamReportSections(
        reportData
    );
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

        currentTeamBreakdown =
            null;

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


        if (
            key ===
            "__all__"
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

            selectedTeamReport =
                "cumulative_box";

        } else {

            selectedTeam =
                manifest.teams.find(
                    team =>
                        team.key ===
                        key
                )
                || null;

            if (
                selectedTeamReport ===
                "cumulative_box"
            ) {
                selectedTeamReport =
                    "play_types";
            }

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


        await loadSelectedTeamView();
    }
);


teamReportTabsEl
    .querySelectorAll(
        "[data-team-report]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                if (
                    button.disabled
                ) {
                    return;
                }

                selectedTeamReport =
                    button.dataset.teamReport;

                teamSortState = {
                    column: null,
                    direction: null
                };

                resetTeamFilter();

                await loadSelectedTeamView();
            }
        );

    });


teamSideControlsEl
    .querySelectorAll(
        "[data-team-side]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                selectedTeamSide =
                    button.dataset.teamSide;

                await loadSelectedTeamView();
            }
        );

    });


teamMetricSelectEl.addEventListener(
    "change",
    () => {

        selectedTeamMetric =
            teamMetricSelectEl.value;

        if (
            currentTeamBreakdown
        ) {
            renderTeamGameBreakdown(
                currentTeamBreakdown
            );
        }
    }
);


/* ============================================================
   TEAM REPORT TABLES
============================================================ */

function formatTeamReportValue(
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
        typeof value !==
        "number"
    ) {
        return String(value);
    }

    if (
        column.includes("%") ||
        column.endsWith(" RANK")
    ) {
        return `${value}%`;
    }

    if (
        column ===
        "PPP"
    ) {
        return value.toFixed(3);
    }

    if (
        [
            "PPS",
            "SSQ",
            "SSM",
            "FTA/FGA",
            "3PA/FGA"
        ].includes(column)
    ) {
        return value.toFixed(2);
    }

    return value.toLocaleString();
}


function renderTeamReportSections(
    data
) {
    teamReportTablesEl.innerHTML =
        "";

    const sections =
        data?.sections || [];

    if (
        !sections.length
    ) {

        teamReportTablesEl.innerHTML = `
            <div class="empty-state team-data-empty">
                <p>
                    No team report tables are available.
                </p>
            </div>
        `;

        return;
    }


    sections.forEach(
        section => {

            const block =
                document.createElement(
                    "section"
                );

            block.className =
                "report-table-block team-synergy-table";


            const title =
                document.createElement(
                    "div"
                );

            title.className =
                "report-table-title";

            title.innerHTML = `
                <span>
                    ${escapeHtml(
                        section.name
                    )}
                </span>

                <span class="report-table-count">
                    ${section.rows?.length || 0} rows
                </span>
            `;


            const scroll =
                document.createElement(
                    "div"
                );

            scroll.className =
                "table-scroll";


            const table =
                document.createElement(
                    "table"
                );

            table.className =
                "data-table team-report-data-table";


            const columns =
                section.columns || [];


            table.innerHTML = `
                <thead>
                    <tr>
                        ${columns.map(
                            column => `
                                <th>
                                    ${escapeHtml(
                                        column
                                    )}
                                </th>
                            `
                        ).join("")}
                    </tr>
                </thead>

                <tbody>

                    ${(section.rows || []).map(
                        row => `
                            <tr>

                                ${columns.map(
                                    column => `
                                        <td>
                                            ${escapeHtml(
                                                formatTeamReportValue(
                                                    row[column],
                                                    column
                                                )
                                            )}
                                        </td>
                                    `
                                ).join("")}

                            </tr>
                        `
                    ).join("")}

                </tbody>
            `;


            scroll.appendChild(
                table
            );

            block.appendChild(
                title
            );

            block.appendChild(
                scroll
            );

            teamReportTablesEl.appendChild(
                block
            );

        }
    );
}


/* ============================================================
   PER GAME BREAKDOWN
============================================================ */

function populateTeamMetricSelect(
    data
) {
    const metrics =
        data?.metrics || [];

    teamMetricSelectEl.innerHTML =
        "";

    metrics.forEach(
        metric => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                metric.code;

            option.disabled =
                metric.supported ===
                false;

            option.textContent = (
                metric.supported === false

                    ? `${metric.label} — unavailable`

                    : metric.label
            );

            teamMetricSelectEl.appendChild(
                option
            );

        }
    );


    const supportedCodes =
        new Set(
            metrics
                .filter(
                    metric =>
                        metric.supported !==
                        false
                )
                .map(
                    metric =>
                        metric.code
                )
        );


    if (
        !supportedCodes.has(
            selectedTeamMetric
        )
    ) {

        selectedTeamMetric =
            data?.default_metric
            || "PTS";

    }


    teamMetricSelectEl.value =
        selectedTeamMetric;
}


function formatTeamBreakdownValue(
    value,
    metric
) {
    if (
        value === null ||
        value === undefined ||
        Number.isNaN(value)
    ) {
        return "—";
    }

    switch (
        metric?.format
    ) {

        case "integer":

            return Number(
                value
            ).toLocaleString(
                undefined,
                {
                    maximumFractionDigits:
                        0
                }
            );


        case "percent":

            return (
                `${Number(value).toFixed(1)}%`
            );


        case "decimal3":

            return Number(
                value
            ).toFixed(3);


        case "decimal2":

            return Number(
                value
            ).toFixed(2);


        case "decimal1":

            return Number(
                value
            ).toFixed(1);


        default:

            return String(
                value
            );
    }
}


function renderTeamGameBreakdown(
    data
) {
    teamGameBreakdownEl.innerHTML =
        "";

    const entities =
        data?.entities || [];

    const rows =
        data?.rows || [];

    const metric =
        (
            data?.metrics || []
        ).find(
            item =>
                item.code ===
                selectedTeamMetric
        );


    if (
        !entities.length ||
        !rows.length ||
        !metric
    ) {

        teamGameBreakdownEl.innerHTML = `
            <div class="empty-state team-data-empty">
                <p>
                    No per-game breakdown is available.
                </p>
            </div>
        `;

        return;
    }


    const block =
        document.createElement(
            "section"
        );

    block.className =
        "report-table-block";


    const title =
        document.createElement(
            "div"
        );

    title.className =
        "report-table-title";

    title.innerHTML = `
        <span>
            ${escapeHtml(
                metric.label
            )}
        </span>

        <span class="report-table-count">
            ${entities.length} games
        </span>
    `;


    const scroll =
        document.createElement(
            "div"
        );

    scroll.className =
        "table-scroll team-breakdown-scroll";


    const table =
        document.createElement(
            "table"
        );

    table.className =
        "data-table team-breakdown-table";


    table.innerHTML = `
        <thead>

            <tr>

                <th>
                    STAT
                </th>

                ${entities.map(
                    entity => `
                        <th
                            title="${escapeHtml(
                                entity.opponent || ""
                            )}"
                        >
                            ${escapeHtml(
                                entity.label
                            )}
                        </th>
                    `
                ).join("")}

            </tr>

        </thead>

        <tbody>

            ${rows.map(
                row => `
                    <tr>

                        <td>
                            ${escapeHtml(
                                row.stat
                            )}
                        </td>

                        ${entities.map(
                            entity => {

                                const value =
                                    row.values
                                        ?.[entity.key]
                                        ?.[selectedTeamMetric];

                                return `
                                    <td>
                                        ${escapeHtml(
                                            formatTeamBreakdownValue(
                                                value,
                                                metric
                                            )
                                        )}
                                    </td>
                                `;
                            }
                        ).join("")}

                    </tr>
                `
            ).join("")}

        </tbody>
    `;


    scroll.appendChild(
        table
    );

    block.appendChild(
        title
    );

    block.appendChild(
        scroll
    );

    teamGameBreakdownEl.appendChild(
        block
    );
}


/* ============================================================
   START
============================================================ */

initialize();