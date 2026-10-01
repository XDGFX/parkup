# parkup

Finds places to park a van overnight in Taringa, Indooroopilly and St Lucia, from Brisbane City Council's parking-sign data and OSM. Vocabulary follows [`CONTEXT.md`](CONTEXT.md); the spec is [#14](https://github.com/XDGFX/parkup/issues/14).

## Commands

| Command | What it does |
|---|---|
| `npm run snapshot` | Fetches BCC parking signs and OSM centrelines into `data/snapshot/` (committed). |
| `npm run build:data` | Snapshot to candidates: writes `public/candidates.json` and `data/build-report.{md,json}`. Add `-- --snapshot` to take a fresh snapshot first. |
| `npm run dev` | Runs the app locally. |
| `npm test` | Timetable (seam 1) and build (seam 2) tests. |
| `npm run typecheck` | TypeScript check. |

The app deploys to GitHub Pages from `main`.

## Layout

- `src/timetable/` — the weekly timetable, `statusAt`, `outBy`, `canStay` and the Tonight, Weekend and Now presets, in Brisbane time. Shared by the build and the app.
- `src/build/` — snapshot, plate parser, kerb-stretch builder, screen and the build entry point. Thresholds live in `config.ts`.
- `src/app/` — the MapLibre app (layout A1, Dusk).

## Licences

The candidates dataset is derived from OpenStreetMap (ODbL) and Brisbane City Council open data (CC BY 4.0).
