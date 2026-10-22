# Synergy Basketball Browser

Static basketball reports served from `docs/`. The League and Season selectors
are populated by `docs/data/synergy/catalog.json`.

CEBL has team cumulative boxes, player/team Play Types and Shot Types, and
player leaderboards for its previously published 2024–2026 seasons. Its older
2022 and 2023 exports provide cumulative boxes. NBA coverage starts with
regular-season team cumulative boxes from 2022-2023 onward. Views enable only
when that league/season's manifest advertises the corresponding reports.

NBA G League also provides regular-season cumulative boxes for 2022-2023 through
2025-2026. Opening Tip-Off Tournament and playoff stages are excluded. In 2025-2026,
Winter Showcase games count toward the regular season except its championship;
those eligible games are included and the exact championship game is excluded. Game
counts are checked against the announced season formats (32, 34, 34, and 36
regular-season games respectively), with source shortfalls disclosed per team.
Source team labels are preserved as Synergy displays them, including later
rebrands applied to historical seasons.
For 2024-2025 and 2025-2026, Synergy's Regular Season label also covers opening
tournament games. The exporter narrows the source's existing game query to the
official regular-season date window and retains the selected game IDs and dates
in each team's manifest entry. The selected-game count must match the cumulative
footer GP; all returned games must belong to the requested team, season, league
and regular-season dates. The 2025-2026 selection includes eligible games from
Synergy's Showcase category and documents the reviewed championship exclusion.

The League dropdown also includes 48 international competitions, with only
completed seasons offered from 2022-2023 through 2025-2026. These exports contain
team cumulative boxes, including player roster rows, across all source stages.
They do not include Play Types, Shot Types, or player leaderboards. NBA remains
regular season only. International season IDs follow Synergy's source IDs;
some summer competitions display a single calendar year in Synergy.

Each manifest retains source coverage notes and any reviewed source exclusions.
For example, the shared Floater entry is excluded where its source page switches
outside the requested competition; the original source count and exclusion
reason are recorded. Completeness against official schedules is not independently
audited. Seven incomplete league-seasons are omitted from the dropdown and listed
in `docs/data/synergy/international-coverage.json`.

## Data layout

- Existing CEBL: `docs/data/synergy/<season>/`
- NBA regular season: `docs/data/synergy/nba/<season>/regular_season/`
- G League regular season: `docs/data/synergy/g_league/<season>/regular_season/`
- International all stages: `docs/data/synergy/international/<league>/<season>/all_stages/`
- Dataset catalog: `docs/data/synergy/catalog.json`

Each season has a `manifest.json`, team CSV/JSON files, and combined cumulative
boxes. NBA entries retain source jersey numbers and duplicate roster names as
separate source rows. Regular-season filtering is recorded in each NBA manifest.
The source covers only 81 of 82 games for Sacramento and Toronto in 2024-2025;
the viewer and manifest flag those limitations while preserving Synergy's stats.

The authenticated Synergy scraper lives outside this repository. This repo
contains exported reports and the viewer, with no browser profile or credentials.
To add a league, first verify and export its source competition and seasons into
an isolated directory, then register complete datasets in the catalog.

## Preview

Serve `docs/` with a local HTTP server and open its URL in a browser, for example:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory docs
```

Existing CEBL links such as `?season=2025-2026` still work. NBA links use
`?league=nba&season=2022-2023&view=teams`.

Use the Seasons menu to check one or more available seasons, then Apply. Select
all checks every published season for that league. Multi-season views combine
cumulative-box rows with a visible Season column; each source player/team/season
row stays separate, and statistics are not summed across years. Team filters and
CSV downloads work across the selected seasons. Choose one season to use its
available Play Types, Shot Types, player reports, and leaderboards.

Share a comparison with `?league=nba&seasons=all&view=teams`, or choose specific
years with `?league=nba&seasons=2025-2026,2023-2024&view=teams`. Only published
seasons are offered, including when switching leagues.

The Leagues picker supports searching and checking several competitions before
applying. Multi-league comparisons add a League column and keep a club's rows
separate for each competition. Seasons are chosen from the selected leagues'
published years; leagues without data for a selected year are disclosed rather
than substituted with another year. Large multi-league tables show 250 rows per
page, while CSV downloads include every filtered row across all pages.

Reset filters returns to the default CEBL league's latest season with all teams
and clears team, stat, and sort filters. Share comparisons using, for example,
`?leagues=nba,australian_nbl&seasons=all&view=teams`.
