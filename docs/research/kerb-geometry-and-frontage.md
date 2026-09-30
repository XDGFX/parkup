# Kerb geometry and frontage sources

Research for [#3](https://github.com/XDGFX/parkup/issues/3). Area: Taringa, Indooroopilly and St Lucia (Brisbane City Council). Queries run on 2026-09-30; numbers below are from those queries unless a source is cited.

## Answer

- **Kerb geometry:** use **OpenStreetMap road centrelines**, offset left and right. No government source publishes a kerb line for these suburbs. OSM covers every public road, and a local mapping effort (2024–26) has already tagged `parking:*` on 55% of road length and 71% of ways. BCC's painted-line dataset gives ~51 km of kerb-hugging no-stopping lines, which works as a correction and cross-check layer.
- **Frontage:** use **BCC City Plan 2014 zoning** for the land-use class, and **BCC's cadastre (property boundaries — parcel)** for where the road reserve ends. Zoning cleanly separates open space, rail corridor, industry and residential. No open source reliably marks **vacant** land; that is a job for the agent evaluation.

## Kerb geometry

### What exists

| Source | Geometry | Coverage in area | Useful attributes | Licence |
|---|---|---|---|---|
| OSM `highway=*` ways | Centreline, crowd-surveyed against aerial imagery | All public roads: 2,088 ways, 138.7 km (excluding `service`) | `parking:left/right/both`, `oneway`, `lanes` (48% of ways), `width` (3%), `sidewalk` (77%) | ODbL 1.0 |
| QLD *Queensland roads and tracks* (QRT) | Centreline, "approximal" | 1,457 segments in a test bbox | `class`, `travel_direction`, `locality_left/right`; `lane_count` "Unknown" on 97%; `pos_accuracy` "U" on 100% | CC BY 4.0 |
| QLD *State controlled roads surveyed centreline* | GPS-surveyed centreline | State roads only (e.g. Moggill Rd), not local streets | TMR road IDs | CC BY 3.0 AU |
| BCC *City Plan 2014 — Transport noise corridor overlay — Brisbane road centreline* | Centreline | 80 short segments on major roads only | None useful | CC BY 4.0 |
| BCC *City Plan 2014 — Road hierarchy overlay* | Centreline | Arterial/suburban routes only | Hierarchy class | CC BY 4.0 |
| BCC *Property boundaries — Parcel* | Road-reserve polygons (`par_ind_desc` = Road / Intersection) | All roads | Reserve boundary, not kerb | CC BY 4.0 |
| BCC *Parking — Line locations* | Painted-line polylines, drawn at the kerb | Taringa, Indooroopilly, St Lucia: 1,389 "No Stopping Line" features, 50.8 km | `pavementmarkingsubtype`, `parkingrestrictiontype`, length | CC BY 4.0 |

Nothing in the BCC open data catalogue (446 datasets, listed via its API) or on data.qld.gov.au is a kerb, kerb-and-channel or carriageway-edge line. A CKAN search for "kerb" on data.qld.gov.au returns only a bin collection calendar.

### OSM `parking:*` coverage (Taringa + Indooroopilly + St Lucia admin boundaries)

Length-weighted share of each road class with any of `parking:both/left/right`:

| `highway` | Ways | Tagged | km | km tagged | % |
|---|---|---|---|---|---|
| residential | 1,169 | 910 | 82.9 | 48.5 | 58 |
| tertiary | 259 | 148 | 19.4 | 7.6 | 39 |
| secondary | 264 | 240 | 12.0 | 10.2 | 85 |
| unclassified | 155 | 102 | 11.1 | 5.5 | 49 |
| trunk | 117 | 17 | 6.4 | 0.7 | 11 |
| primary | 88 | 52 | 4.4 | 2.6 | 60 |
| **All** | **2,088** | **1,481** | **138.7** | **75.6** | **55** |

- Values (per side-key): `no` 1,015; `lane` 761; `half_on_kerb` 30; `separate` 15; `street_side` 14; `on_kerb` 11.
- Fresh: every tagged way was last edited in 2024–2026 (891 / 399 / 191 by year). Two mappers account for most of it.
- `parking:*:restriction` and time conditions: **0** in the area. The tags are physical ("is there a place to park?"), not legal. Legal restrictions still have to come from BCC sign data.
- Wider bbox (includes Toowong and Chapel Hill): 2,439 of 6,483 ways tagged, so the effort extends past the three suburbs.
- Other kerb-ish features: 1,418 `barrier=kerb` nodes (crossing points, not lines), 1,223 `footway=sidewalk` ways, 56 `amenity=parking` + `parking=street_side` areas, 15 `area:highway` polygons. Separately mapped sidewalks roughly trace the kerb but sit behind the verge.

The [Street parking wiki page](https://wiki.openstreetmap.org/wiki/Street_parking) defines `parking:<side>` as the physical position (`lane`, `street_side`, `on_kerb`, `half_on_kerb`, `shoulder`, `separate`, or `no` "if there is no parking"). Legal limits go in `parking:<side>:restriction`, and `parking:lane` has been deprecated. `left`/`right` are relative to the way's drawing direction.

### Accuracy

- **OSM:** no stated positional accuracy. In practice it is traced from aerial imagery to a few metres, and spot checks put it within the BCC road parcel. Snapping a sign point to the nearest centreline side is well within tolerance.
- **QRT:** metadata calls it "approximal centreline location", and every segment here has `pos_accuracy = U` (unknown) (data.qld.gov.au metadata; REST layer `Transportation/RoadsAndTracks/MapServer/10`).
- **Cadastre:** 96% of the area's parcels have accuracy code "STANDARD 1:2500 CADASTRAL MAP – 1.5M" (QLD `LandParcelPropertyFramework/MapServer/4`), so reserve edges are good to about 1.5 m.
- **Painted lines:** captured as asset records at the kerb. This is the only open dataset positioned at the kerb itself, but it only exists where paint does.

### Offsetting each side

- OSM gives a side-aware model for free: `parking:left` / `parking:right` match an offset of +d or −d along the way direction. A kerb stretch can be one side of one OSM way, split wherever tags or signs change.
- Offset distance: `width` is almost never tagged (58 ways), so use a per-class default (for example half of about 7–8 m for residential), or measure it as half the BCC road-parcel width minus the verge. The QLD cadastre says nothing about carriageway width.
- Sign snapping: BCC's *Parking — Sign locations* has `signdirection`. Put each sign on the nearer side of the nearest centreline and cross-check against any painted line within a few metres.
- QRT has `locality_left/right` but no parking or side attributes, and its geometry is less accurate. It adds nothing over OSM here.

### Licence implications

- **OSM (ODbL 1.0):** attribution required ("© OpenStreetMap contributors"). A derived *database* that is publicly used must be offered under ODbL; a *produced work* such as rendered map tiles need not be ([OSMF licence FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ)). If parkup publishes kerb stretches as downloadable GeoJSON, that file inherits ODbL. Combining it with CC BY 4.0 BCC data is fine in that direction.
- **BCC and QLD:** CC BY 4.0 (attribution only), except the TMR state road layers (CC BY 3.0 AU).

## Frontage

### What exists

| Source | Unit | Coverage | Classes relevant to frontage | Currency | Licence |
|---|---|---|---|---|---|
| BCC *City Plan 2014 — Zoning overlay* | Dissolved zone polygons (not per lot; `lot_plan` null in all sampled records) | Whole city, excluding road reserves | Open space (Local/District), Sport and recreation, Environmental management, Conservation, **Special purpose (Transport infrastructure)** = rail corridor, Low impact industry, Low/Low-medium/Medium/High density and Character residential, centres, Mixed use, Education, Community purposes, Emerging community | Modified 2026-09-18 | CC BY 4.0 |
| BCC *Property boundaries — Parcel* | Cadastral lots, including Road and Intersection parcels | Whole city | Tenure (Freehold, Reserve, Lands Lease), lot/plan, address | Daily (modified 2026-09-29) | CC BY 4.0 |
| BCC *Park — Locations* | Park polygons | Council parks | Park name/number | 2026-09-09 | CC BY 4.0 |
| BCC *Railway — Line locations* | Rail centreline | Ipswich/Rosewood and Main lines | — | 2024-06-24 | CC BY 4.0 |
| QLD *Land use mapping — current* (QLUMP, ALUM classification) | Land-use polygons | 113 polygons in the test bbox | Urban residential, Recreation and culture, Railways, Manufacturing and industrial, Land in transition, Other minimal use | **2013 mapping** for this area | CC BY 4.0 (web service) |
| QLD *Cadastral data* (DCDB) | Lots | Statewide | Parcel type, tenure; no land use | Current | CC BY 4.0 |
| OSM `landuse` / `leisure` | Mapper-drawn areas | 458 `landuse=residential`, 78 `leisure=park`, 179 pitches, 66 rail ways, 8 brownfield, 11 construction, 3 industrial, 3 greenfield | Mixed; blanket polygons of uneven detail | Varies | ODbL |

### Spot checks (BCC API, point-in-polygon)

- Three points on the OSM rail line through Indooroopilly all fell in zoning **"Special purpose (Transport infrastructure)"** on Lands Lease lots (for example 292SP129994), so the rail corridor is identifiable from zoning.
- Four residential-road centre points fell in **no** zoning polygon and in BCC parcels marked `Road` or `Intersection`. Road reserves are unzoned, so a frontage probe should step off the kerb away from the road until it leaves the road parcel, then read the first zone polygon it meets.

Zone mix in a bbox around the three suburbs (polygon counts): Low density residential 227, Low-medium density 169, Character (Character) 104, Open space (Local) 53, Character (Infill) 50, Medium density 29, Open space (District) 26, Education 16, Sport and recreation (District) 16, Special purpose (Utility services) 13, Environmental management 10, Low impact industry 2, Special purpose (Transport infrastructure) 3, among others.

### Mapping to CONTEXT.md frontage classes

| Frontage | Best source | Notes |
|---|---|---|
| Residential | Zoning: any "residential" zone, including Character | Reliable |
| Park | Zoning: Open space / Sport and recreation / Environmental management / Conservation; BCC *Park — Locations* for names | Reliable |
| Rail corridor | Zoning: Special purpose (Transport infrastructure); BCC or OSM rail line as confirmation | Confirmed on spot checks |
| Industrial | Zoning: Low/Medium/General impact industry | Very little in these suburbs (2 polygons) |
| Vacant | **No reliable open source.** Zoning describes permitted use, not current use. QLUMP "Land in transition" / "Other minimal use" dates from 2013. OSM `brownfield` / `construction` / `greenfield` is sparse. | Leave to the agent's imagery evaluation |

Granularity: zoning polygons are dissolved by zone, so a kerb stretch that faces several lots gets one class per zone change. That is enough for frontage. Where a zone boundary falls mid-stretch, split the stretch or take the majority.

BCC also publishes *Land Use Code and Rating Category — Definitions*, but only as a code lookup table; no per-parcel land-use code is openly published. The QLD *Valuation Property Boundaries* layer is described as dissolved by owner and "land use", but I could not confirm from its metadata that it exposes a land-use code attribute.

## Recommendation for the build

1. Pull OSM `highway` ways for the three suburbs (Overpass, `out geom`) and build a kerb line per side by offsetting the centreline, taking the offset from a per-class default width. Carry `parking:<side>` as a physical prior: `no` means "not a candidate unless signs say otherwise".
2. Snap BCC sign points and painted no-stopping lines to the nearest way side.
3. For frontage, cast a short perpendicular probe from each kerb stretch, skip BCC Road/Intersection parcels, and read `lvl2_zone` from the City Plan zoning overlay. Map it to the CONTEXT.md classes with the table above.
4. Mark vacancy as unknown and let evaluation decide.
5. Show ODbL and CC BY attribution in the app. Decide whether published kerb-stretch data is an ODbL "derivative database" before shipping a download.

## Sources

- OSM data via Overpass API (`overpass-api.de`), queried 2026-09-30 inside admin_level=9 relations 11677824 (Indooroopilly), 11677827 (St Lucia) and 11677828 (Taringa).
- OSM Wiki, [Street parking](https://wiki.openstreetmap.org/wiki/Street_parking), for the `parking:*` scheme and the `parking:lane` deprecation.
- OSMF, [Licence and Legal FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ), and [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- BCC Open Data (Opendatasoft Explore API v2.1, `data.brisbane.qld.gov.au/api/explore/v2.1/`) datasets:
  [cp14-zoning-overlay](https://data.brisbane.qld.gov.au/explore/dataset/cp14-zoning-overlay/),
  [property-boundaries-parcel](https://data.brisbane.qld.gov.au/explore/dataset/property-boundaries-parcel/),
  [property-boundaries-holding](https://data.brisbane.qld.gov.au/explore/dataset/property-boundaries-holding/),
  [parking-line-locations](https://data.brisbane.qld.gov.au/explore/dataset/parking-line-locations/),
  [parking-sign-locations](https://data.brisbane.qld.gov.au/explore/dataset/parking-sign-locations/),
  [parking-clearways](https://data.brisbane.qld.gov.au/explore/dataset/parking-clearways/),
  [park-locations](https://data.brisbane.qld.gov.au/explore/dataset/park-locations/),
  [railway-line-locations](https://data.brisbane.qld.gov.au/explore/dataset/railway-line-locations/),
  [cp14-transport-noise-corridor-overlay-brisbane-road-centreline](https://data.brisbane.qld.gov.au/explore/dataset/cp14-transport-noise-corridor-overlay-brisbane-road-centreline/),
  [cp14-road-hierarchy-overlay-road-hierarchy](https://data.brisbane.qld.gov.au/explore/dataset/cp14-road-hierarchy-overlay-road-hierarchy/). All CC BY 4.0 per catalogue metadata.
- Queensland Government Open Data (CKAN `data.qld.gov.au/api/3/`):
  [queensland-roads-and-tracks](https://www.data.qld.gov.au/dataset/queensland-roads-and-tracks),
  [state-controlled-roads-surveyed-centreline-queensland](https://www.data.qld.gov.au/dataset/state-controlled-roads-surveyed-centreline-queensland),
  [cadastral-data-queensland-series](https://www.data.qld.gov.au/dataset/cadastral-data-queensland-series),
  [land-use-mapping-current-web-service-json](https://www.data.qld.gov.au/dataset/land-use-mapping-current-web-service-json),
  [valuation-property-boundaries-queensland](https://www.data.qld.gov.au/dataset/valuation-property-boundaries-queensland).
- QLD Spatial ArcGIS REST (`spatial-gis.information.qld.gov.au/arcgis/rest/services/`): `Transportation/RoadsAndTracks/MapServer/10`, `PlanningCadastre/LandParcelPropertyFramework/MapServer/4`, `PlanningCadastre/LandUse/MapServer/0`, queried with envelope 152.965,−27.51 to 153.005,−27.485.
