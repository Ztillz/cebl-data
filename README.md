# Synergy Basketball Browser

Static basketball reports served from `docs/`. The League and Season selectors
are populated by `docs/data/synergy/catalog.json`.

CEBL has team cumulative boxes, player/team Play Types and Shot Types, and
player leaderboards for its published seasons. NBA coverage starts with
regular-season team cumulative boxes from 2022-2023 onward. Views enable only
when that league/season's manifest advertises the corresponding reports.

## Data layout

- Existing CEBL: `docs/data/synergy/<season>/`
- NBA regular season: `docs/data/synergy/nba/<season>/regular_season/`
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
