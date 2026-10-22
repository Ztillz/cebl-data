/* Multi-season cumulative boxes retain one row per source player/team/season. */
function requestedSeasonDatasets(league, params) {
    const requested = params.get("seasons") === "all"
        ? league.seasons.map(season => season.id)
        : (params.get("seasons") || params.get("season") || "").split(",");
    const selected = league.seasons.filter(season => requested.includes(season.id));
    return selected.length ? selected : [league.seasons[0]];
}

function requestedLeagues(catalog, params) {
    const ids = (params.get("leagues") || params.get("league") || catalog.default_league).split(",");
    const selected = catalog.leagues.filter(league => ids.includes(league.id) || params.get("leagues") === "all");
    return selected.length ? selected : [catalog.leagues.find(league => league.id === catalog.default_league) || catalog.leagues[0]];
}

function availableSeasons(leagues) {
    const seasons = new Map();
    leagues.forEach(league => league.seasons.forEach(season => {
        if (!seasons.has(season.id)) seasons.set(season.id, {id: season.id, label: season.id});
    }));
    return [...seasons.values()].sort((a, b) => b.id.localeCompare(a.id));
}

async function fetchWithLimit(items, load, concurrency = 4) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await load(items[index], index);
        }
    }));
    return results;
}

function combineSeasonBoxes(datasets, manifests, recordsBySeason, multiLeague = false) {
    const teams = new Map();
    const rowsByTeam = new Map();
    const allRows = [];
    const coverageNotes = [];
    const exclusions = [];
    manifests.forEach((source, index) => {
        const season = datasets[index].id;
        const leagueId = datasets[index].leagueId;
        const leagueLabel = datasets[index].leagueLabel;
        const context = multiLeague ? `${leagueLabel} / ${season}` : season;
        const names = new Map();
        source.teams.forEach(team => {
            // Stable name keys preserve historical team names while removing
            // the source ID suffix used in newer exports.
            const nameKey = team.key.replace(/__[a-f0-9]{24}$/, "");
            const key = multiLeague ? `${leagueId}::${nameKey}` : nameKey;
            if (names.has(team.team)) throw new Error(`Ambiguous team name in ${season}: ${team.team}`);
            names.set(team.team, key);
            if (!teams.has(key)) {
                teams.set(key, {key, team: team.team, display_name: multiLeague ? `${team.team} — ${leagueLabel}` : team.team,
                    league_id: leagueId, cumulative_box: `multi:${key}`, reports: {}, seasons: []});
                rowsByTeam.set(`multi:${key}`, []);
            }
            const combined = teams.get(key);
            // Existing exports vary in accents/capitalization for the same
            // stable team key. Keep the newest label and each row's source name.
            combined.seasons.push(season);
            const notes = team.source_coverage?.message || (team.source_coverage_notes || []).map(note => note.message).join(" ");
            if (notes) {
                combined.source_coverage = {message: [combined.source_coverage?.message, `${context}: ${notes}`].filter(Boolean).join(" ")};
            }
        });
        recordsBySeason[index].forEach(record => {
            if (record.SEASON && record.SEASON !== season) throw new Error(`Unexpected season in ${season} cumulative box`);
            const key = names.get(record.TEAM);
            if (!key) throw new Error(`Unknown team in ${season}: ${record.TEAM}`);
            const row = {...record, ...(multiLeague ? {LEAGUE: leagueLabel} : {}), SEASON: season};
            allRows.push(row);
            rowsByTeam.get(`multi:${key}`).push(row);
        });
        (source.coverage_notes || []).forEach(note => {
            if (typeof note === "string") {
                if (!coverageNotes.includes(note)) coverageNotes.push(note);
            } else coverageNotes.push({...note, message: `${context}: ${note.message || ""}`});
        });
        (source.source_exclusions || []).forEach(entry => exclusions.push({...entry, season, league: leagueLabel}));
    });
    rowsByTeam.set("multi:all", allRows);
    return {
        rowsByTeam,
        manifest: {
            season: [...new Set(datasets.map(season => season.id))].join(", "),
            game_scope: manifests.every(source => source.game_scope === manifests[0].game_scope) ? manifests[0].game_scope : "mixed",
            scope: "cumulative_box", players: [], leaderboards: {},
            teams: [...teams.values()], team_count: teams.size, player_count: allRows.length,
            combined: {"team_cumulative_box.json": "multi:all"},
            coverage_notes: coverageNotes, source_exclusions: exclusions
        }
    };
}
