<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/banner-dark.svg">
  <img alt="parkup: quiet places to park a van overnight in Brisbane" src="docs/img/banner-light.svg" width="100%">
</picture>

<br><br>

<img src="docs/img/map.png" width="220" alt="Map of Taringa at dusk with coloured candidate kerbs">&nbsp;&nbsp;
<img src="docs/img/card.png" width="220" alt="Candidate card for Heroes Ave, rated good">&nbsp;&nbsp;
<img src="docs/img/out-by.png" width="220" alt="Candidate card showing an out-by time">

<sub>Prototype screens</sub>

</div>

parkup combines Brisbane City Council's parking-sign data with OpenStreetMap to find kerbs and car parks where you can legally stay the night. It then ranks them by how secluded they look from overhead imagery. Pick **Tonight**, **Weekend** or **Now**, tap a pin to see when you'd have to move and where the nearest toilet is, then open it in Google Maps to check it and save it.

It runs as a static site on GitHub Pages. Imagery is evaluated offline beforehand, so the app needs no account or API key.

> [!WARNING]
> A first screen, not legal advice. Always check the signs on arrival.

**Status:** in development. [Open the app](https://xdgfx.github.io/parkup/), or see the [spec and build tickets](https://github.com/XDGFX/parkup/issues/14).

## Development

### Commands

| Command | What it does |
|---|---|
| `npm run snapshot` | Fetches BCC parking signs and OSM centrelines into `data/snapshot/` (committed). |
| `npm run build:data` | Snapshot to candidates: writes `public/candidates.json` and `data/build-report.{md,json}`. Add `-- --snapshot` to take a fresh snapshot first. |
| `npm run evaluate -- queue [--force] [--json]` | Lists the candidates without a current evaluation, in tier order, grouped by suburb. Rebuild the data first. |
| `npm run evaluate -- prepare\|check\|calibrate` | Evaluation batch helpers: fetch each candidate's context and imagery, check and stamp the agents' output, and compare the calibration set with your verdicts. The agents themselves run in a Claude Code session following `src/evaluate/batch-prompt.md`. |
| `--skip-calibration-gate` | `queue` and `prepare` for a batch refuse to run until the committed calibration passes on the current rubric version; this flag overrides that, for calibration work itself. |
| `npm run dev` | Runs the app locally. |
| `npm test` | Timetable (seam 1), build (seam 2, including sites, toilets and evaluation carry-over) and evaluation post-processing and calibration tests. |
| `npm run typecheck` | TypeScript check. |

The app deploys to GitHub Pages from `main`.

### Layout

- `src/timetable/` — the weekly timetable, `statusAt`, `outBy`, `canStay` and the Tonight, Weekend and Now presets, in Brisbane time. Shared by the build and the app.
- `src/build/` — snapshot, plate parser, kerb-stretch builder, screen and the build entry point. Thresholds live in `config.ts`.
- `src/app/` — the MapLibre app (layout A1, Dusk).
- `src/evaluate/` — the evaluation batch: rubric, schema, batch prompt, context fetch, post-processing and the calibration check. The calibration set and its latest run are in `data/calibration/` (see `report.md`).

### Evaluation imagery and elevation: terms

Checked October 2026. Imagery is fetched to the gitignored `.cache/imagery/` and never committed or served by the app.

- **Esri World Imagery** (`server.arcgisonline.com/.../World_Imagery/MapServer/export`, about 30 cm, 2025). Licensed under the [Esri Master License Agreement](https://goto.arcgis.com/termsofuse/viewsummary); attribution "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community". The export works without a key or account, but the terms don't say whether keyless use is allowed: they neither require nor waive an ArcGIS account, give no non-commercial exception, and say the layer "is not intended to be used to export tiles for offline". Treat keyless export as a grey area. Keep batches small, and if Esri throttles or blocks it, `prepare` falls back to the QLD aerial alone.
- **Queensland aerials** (`spatial-img.information.qld.gov.au/.../Basemaps/LatestStateProgram_AllUsers/ImageServer`, 10 cm, 2022 in Brisbane). Keyless. The 2022 state-programme imagery is CC BY 4.0, © State of Queensland. The service also mosaics Planet satellite fill, which is all rights reserved, so don't assume every pixel is open.
- **Queensland DEM** (`.../Elevation/QldDem/ImageServer`). **CC BY-SA** (not CC BY), © State of Queensland, with Commonwealth (Geoscience Australia) material. Its copyright text and the State's no-warranty disclaimer must go with any copy. It's a mosaic: the finest pixel is 0.5 m, from 0.5 m and 1 m LiDAR DEMs where they exist, falling back to about 30 m SRTM elsewhere. The service doesn't say which areas are LiDAR; the 5 m samples along Taringa kerbs vary smoothly at centimetre precision, which suggests LiDAR there. Only derived slope and elevation figures are committed.


<sub>Data: Brisbane City Council and Queensland Government (CC BY 4.0), © OpenStreetMap contributors (ODbL), National Public Toilet Map.</sub>
