# Off-road site sources

Research for [#9](https://github.com/XDGFX/parkup/issues/9). Builds on [kerb geometry and frontage](https://github.com/XDGFX/parkup/blob/research/kerb-geometry-and-frontage/docs/research/kerb-geometry-and-frontage.md) (OSM, BCC zoning and cadastre) and [council data semantics](https://github.com/XDGFX/parkup/blob/research/council-data-semantics/docs/research/council-data-semantics.md); it does not repeat them. Queries run on 2026-10-01 unless a source says otherwise.

## Answer

- **OSM is the main source for off-road sites and unsigned car parks.** `amenity=parking` and `highway=track` within 100 m found 9 of the 13 park-ups. Adding BCC *Park — Tracks and Trails* (vehicle access lines in council parks) brings it to 11. The two misses are a quarry edge in Redland and a verge on Boundary Road, which no dataset describes.
- **Car parks:** `amenity=parking` is dense (4,663 in Brisbane) but thinly tagged: 56% carry `access`, 32% `fee` and 30% `surface`, and only 1% are tagged unpaved. Treat a car park with no `access` tag, or `access=yes|permissive`, and no `fee=yes` as a candidate. Drop `access=private|customers`.
- **Tracks:** 1,045 km of `highway=track` in Brisbane, almost all in the western bushland. 322 km is reachable from a public road without crossing a mapped gate or an `access`/`motor_vehicle=no|private` tag. In the three home suburbs there is only 0.5 km, so off-road work there means car parks and quarry or industrial edges.
- **Gates:** 2,585 `barrier=gate` nodes in Brisbane, 537 on tracks. Only 9% say whether they are locked, and tagging along one fire trail is inconsistent, so a missing gate in OSM does not mean no gate. Use OSM gates to rule sites out, and leave "no gate" to imagery.
- **Driveways:** OSM separates them well: `service=driveway` (938 of 1,476 service ways in the three suburbs) and `access=private` (547). An untagged `highway=service` is the ambiguous case.
- **Tenure:** one query per site to the Queensland cadastre (about 0.25 s) returns tenure, parcel type and council. It labels State Forest, National Park, Reserve and road parcels well, but council parkland comes back as Freehold, as six of the park-ups did. In Brisbane, BCC's *Council Vegetation* layer marks council-owned land and closes that gap.

## Ground truth

Each park-up checked against OSM within 100 m (Overpass `around:100`; distances to the nearest point of the feature).

| # | Park-up | What OSM shows within 100 m | Kind (inferred) | Car park ≤50 m | Track ≤100 m | Other OSM signal |
|---|---|---|---|---|---|---|
| 1 | -27.474816, 152.974776 | Mt Coot-tha quarry (`landuse=industrial`, `industrial=mine`) 3 m; `access=private` quarry roads 7 m; public car parks 150–250 m | Quarry edge | – | – | Industrial/mine edge |
| 2 | -27.462729, 152.949241 | Untagged `highway=track` 1 m; `motor_vehicle=private` tracks (Currawang Street Trail) 26 m; Network 10 site | Bush track | (61 m) | 1 m | – |
| 3 | -27.469278, 152.970183 | Gravel car park `access=yes fee=no surface=gravel` 15 m, compacted aisle, bollards and gates mapped 15–55 m, picnic tables | Gravel lot | 15 m | – | Unpaved service |
| 4 | -27.609002, 153.188197 | Inside Karreman Quarries (`landuse=industrial`, `industrial=mine`); no road within 100 m, gravel track 200 m | Quarry edge | – | – | Industrial/mine |
| 5 | -27.345189, 153.097971 | `leisure=slipway` 38 m, service roads 56–80 m; no car park within 250 m | Boat ramp | – | – | Slipway |
| 6 | -27.693700, 152.671475 | Albert Theaker Park Rest Area (`tourism=camp_site`) 14 m, Ipswich Motorsport Precinct; track 94 m | Rest area | – | 94 m | Camp site |
| 7 | -27.567190, 152.986993 | Boundary Road 43 m, cycleway, wetland; `access=customers` car park 200 m | Verge or unmapped lot | – | – | none |
| 8 | -27.547086, 152.982100 | Dunlop Park car park (no tags) 3 m | Park car park | 3 m | – | – |
| 9 | -27.557089, 152.975702 | Mabel Street 5 m; park gates 35 m; car park 71 m | Kerb | (71 m) | – | Kerb pipeline |
| 10 | -27.429901, 153.007892 | Inside car park `access=yes fee=no surface=asphalt` | Off-street lot | 0 m | – | – |
| 11 | -27.428949, 152.878057 | McAfees Lookout car park (no tags) 23 m; Hell Hole Break (`motor_vehicle=private`) 56 m; Nebo Road Break 91 m | Lookout car park | 23 m | 56 m | – |
| 12 | -26.999087, 152.988048 | Only an untagged track 89 m | Bush | – | 89 m | – |
| 13 | -26.924774, 152.996367 | Wild Horse Mountain Lookout car park 9 m; grade 3–4 tracks 15–24 m | Lookout car park | 9 m | 15 m | – |

OSM way [47972652](https://www.openstreetmap.org/way/47972652) (Taringa Community Garden) is `amenity=parking`, `parking=surface`, `access=yes`, `fee=no`, with no `surface` tag. It passes the car-park filter.

Hit rates:

| Source (OSM) | ≤50 m | ≤100 m |
|---|---|---|
| `amenity=parking`, off-street, not `access=private\|customers` | 5 (3, 8, 10, 11, 13) | 7 (+2, 9) |
| `amenity=parking` with explicit `access=yes` and `fee=no` | 2 (3, 10) | 2 |
| `highway=track` | 2 (2, 13) | 5 (+6, 11, 12) |
| Unpaved `highway=service` | 1 (3) | 1 |
| `landuse=industrial` + `industrial=mine` | 2 (1, 4) | 2 |
| `tourism=camp_site` / `leisure=slipway` | 2 (5, 6) | 2 |
| Car park or track, combined | 6 | 9 |

Missed by car park and track: 1 and 4 (quarry edges), 5 (boat ramp with no mapped car park) and 7 (nothing mapped).

Council and state layers at the same points (from point queries; distances to returned geometry):

| # | Council | Cadastre tenure (QLD DCDB) | BCC zoning | BCC Tracks and Trails ≤75 m | QLD Roads and Tracks ≤75 m |
|---|---|---|---|---|---|
| 1 | Brisbane | Freehold (1SP266267, Mt Coot-tha, 365 ha) | Open space (Metro) | Management / multi-use access | none |
| 2 | Brisbane | Freehold (1RP200271, "Mount Coot-tha Forest") | Special purpose (Utility) | Multi-use access (Currawang St Trail), management access ("Fire access around Channel 10") | Track, unsealed, restricted, 37 m |
| 3 | Brisbane | Freehold (867S311380, "Mount Coot-tha Forest") | Conservation (Metro) | – | Walkway 13 m |
| 4 | Redland | Freehold (5RP186598) | n/a | n/a | none |
| 5 | Brisbane | Freehold (4SP272249) | Conservation (Metro) | Access road | Restricted, sealed, 40 m |
| 6 | Ipswich | Freehold (1SP308694) | n/a | n/a | Highway 42 m |
| 7 | Brisbane | Road (Boundary Rd); Reserve and Freehold within 50 m | Rural; Sport and recreation within 50 m | – | Connector 25 m |
| 8 | Brisbane | Freehold (6RP29665) | Sport and recreation (District) | – | Walkway 29 m |
| 9 | Brisbane | Road (Mabel St) | Open space within 50 m | Access road | Local 4 m |
| 10 | Brisbane | Freehold (2RP58389) | Sport and recreation (District) | Access road | Connector 69 m |
| 11 | Brisbane | Road (Mt Nebo Rd) | Environmental management within 50 m | – | Secondary 3 m; non-vehicular track 32 m |
| 12 | Moreton Bay | State Forest (1AP23631, Beerburrum East) | n/a | n/a | **Track, 4WD, unsealed, public, 58 m** |
| 13 | Sunshine Coast | State Forest (1AP23631, Beerburrum East) | n/a | n/a | Local access 3 m; Track, 4WD, 79 m |

- BCC Tracks and Trails adds park-ups 1 and 5, which OSM car parks and tracks miss.
- QLD Roads and Tracks finds the same tracks as OSM at 2 and 12 and adds the useful `trafficability` = 4WD. Its distance search is approximate (it missed a track about 71 m from point 5 and returned segments 124 m from point 6), so filter the returned geometry yourself (inferred: the server buffers in Web Mercator units).
- Park-ups 12 and 13 are in Beerburrum East State Forest (protected-areas layer 10). None is in a national park; 11 is within 500 m of D'Aguilar National Park.

## Sources in detail

### OSM `amenity=parking`

| | Taringa, Indooroopilly, St Lucia | Brisbane LGA |
|---|---|---|
| Features | 174 | 4,663 |
| Off-street (not `street_side`/`lane`/kerb) | 115 | 3,978 |
| `access` tagged | 101 (yes 22, permissive 13, customers 50, private 14) | 2,619 (yes 597, permissive 54, customers 1,237, private 675) |
| `fee` tagged | 66 (no 54, yes 12) | 1,472 (no 1,342, yes 129) |
| `surface` tagged | 16 (1 unpaved) | 1,387 (61 unpaved) |
| Off-street, `access` unset or yes, `fee` unset or no | 48 | 2,043 (23 tagged unpaved) |
| Median off-street area | 464 m² | 638 m² |

- **Vehicle access:** a mapped car park implies vehicle entry by definition ([Tag:amenity=parking](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dparking)). Its entrance road is often not joined to it: only 33 of 107 off-street car-park outlines in the three suburbs share a node with a road, so "is it connected?" cannot be read from topology.
- **Versus driveways:** `access=private` and `access=customers` ([Key:access](https://wiki.openstreetmap.org/wiki/Key:access)) mark residential and shop car parks. 44% of Brisbane car parks have no `access` tag, so the card must show "unknown".
- **Surface:** unpaved is almost never tagged, so "gravel lot" must come from imagery.

### OSM `highway=track` and unpaved `highway=service`

Defined as "a minor land-access road like a farm or forest track" ([Tag:highway=track](https://wiki.openstreetmap.org/wiki/Tag:highway%3Dtrack)).

| | Three suburbs | Brisbane LGA |
|---|---|---|
| `highway=track` | 6 ways, 0.5 km | 2,146 ways, 1,045 km |
| Tagged `access` or `motor_vehicle` = no/private | 1 way | 463 km |
| Reachable from a public road without crossing a mapped barrier or a no/private tag | – | 322 km |
| `tracktype` tagged | 2 ways | 530 ways (25%) |
| Unpaved `highway=service` | 23 ways, 1.5 km | 393 ways, 72 km |

- Reachability was computed by walking the track graph from every track node shared with a public road (not `access=no|private`, not `service=driveway`), stopping at any `barrier=*` node or a no/private way. 623 such entry nodes; 25 carry a barrier themselves.
- Of the reachable 322 km, 248 km is unnamed track and 55 km is named "Break", "Fire", "Trail" or "Track". Named fire breaks in D'Aguilar are QPWS management trails; several (Nebo Road Break, Mermaid Mountain Break, Double Break) come out reachable although parts of Nebo Road Break are `motor_vehicle=no`. **Inferred:** gates on these breaks are under-mapped, so reachability over-counts.
- Unpaved `service` roads are mostly driveways (186 of 393) or untagged (137). Use only those inside or touching a park, reserve or industrial polygon.
- `highway=track` with `access` unset is the right first filter. Treat `motor_vehicle=private` as a soft flag rather than a rule-out: park-up 2 sits beside tracks tagged that way.

### Gates and barriers

| | Three suburbs | Brisbane LGA |
|---|---|---|
| `barrier=gate` nodes | 78 | 2,585 |
| `barrier=lift_gate` (boom gates) | 21 | 235 |
| `barrier=bollard` | 29 | 377 |
| Gates on tracks | 2 | 537 on 507 track ways |
| Gates with `locked=*` | – | 297 (231 yes, 66 no) |

- The [barrier=gate](https://wiki.openstreetmap.org/wiki/Tag:barrier%3Dgate) page asks mappers to tag `locked=*` and to put `access` on the way beyond. Most Brisbane gates (91%) carry neither, so a mapped gate means "a gate exists", not "it is shut at night".
- Car parks: only 4 of 107 off-street car parks in the three suburbs have a gate or bollard on their outline or joining way. Boom gates (`lift_gate`) on `service` roads are the best signal of a commercial or timed car park.
- No open source records signs (as opposed to gates) at car-park entrances. Signs remain an imagery job.

### Quarry and industrial edges

Park-ups 1 and 4 sit on the edges of quarries (`landuse=industrial` + `industrial=mine`). OSM has 3 industrial polygons in the three suburbs; BCC zoning has 2 industry polygons (earlier research). A useful generator is "the edge of an industrial or mine polygon within *n* m of a public road or track", but it yields lines, not sites, so each needs an imagery check.

### Council and state datasets

All CC BY 4.0.

| Dataset | Publisher | What it gives | Coverage | Vehicle access? | Gates? |
|---|---|---|---|---|---|
| [Park — Tracks and Trails](https://data.brisbane.qld.gov.au/explore/dataset/tracks-and-trails/) | BCC (modified 2026-09-09) | 8,989 lines in council parks; `item_type`, `park_name`, `item_description` | Brisbane parks and reserves. In a bbox around the three suburbs: 7 access road, 10 management access only, 2 multi-use access | Yes: `ACCESS ROAD` 364, `MANAGEMENT ACCESS ONLY` 807, `MULTI-USE ACCESS` 1,081 citywide; about 60 fire trails and breaks named in descriptions | No |
| [Park — Designated sites for bookings](https://data.brisbane.qld.gov.au/explore/dataset/park-designated-sites-for-bookings/) | BCC | 50 bookable park sites with `vehicle_access` (22 yes) and surface | Brisbane | Yes | No |
| QPWS access features (`Environment/ParksTerrestrialProtectedAreas/MapServer` layers 1, 2, 4–9) | Qld Department of Environment, Tourism, Science and Innovation | Park roads and tracks with `traffic` (2wd/4wd/closed), `access_` (Public / Management only / Permit) and `class`; class includes "Vehicle barrier or Bollards" (55 in SEQ) | National parks and state forests only; nothing within 300 m of park-up 12 | Yes | Partly |
| [Queensland Roads and Tracks](https://www.data.qld.gov.au/dataset/queensland-roads-and-tracks) (`Transportation/RoadsAndTracks/MapServer/10`) | Qld Department of Resources | Class `Track` with sub-class and `trafficability` 4WD; `surface_type` Sealed / Unsealed / Paper Road | Statewide, about 77k track segments. Brisbane: 1,578 tracks (1,100 unsealed, 361 4WD). Three suburbs: 8 tracks, all sealed and non-vehicular | Partly (`user_access`, `trafficability`) | No |
| Built features — Recreation areas (`Structure/PhysicalInfrastructure/MapServer/260`; camping grounds layer 60) | Qld Spatial | 8,943 park polygons across SEQ; 114 camping grounds | All SEQ councils | No | No |
| [Council Vegetation](https://data.brisbane.qld.gov.au/explore/dataset/protected-vegetation-natural-assets-local-law-2003-council-vegetation/) | BCC | 5,049 polygons of land owned or controlled by council | Brisbane | No | No |

Not found: any open unformed-road dataset (Roads and Tracks has only 27 "Paper Road" surfaces in Brisbane) and any Seqwater recreation trail data. BCC is the only SEQ council publishing on the state portal; Moreton Bay, Ipswich, Logan, Redland and Sunshine Coast portals were not checked.

How they rank for finding sites:

- **BCC Tracks and Trails** is the one non-OSM layer worth ingesting. Its `ACCESS ROAD` lines lead to park car parks and clubhouses, which OSM often has as untagged `service` ways. `MANAGEMENT ACCESS ONLY` is BCC's own label, not a sign on the ground, so treat it like `motor_vehicle=private`: a flag for the card, not a rule-out.
- **QLD Roads and Tracks** duplicates OSM tracks but adds 4WD trafficability, which matters for a 2WD van. Use it as an attribute source, joined to OSM tracks by proximity.
- **QPWS access** is the only open source with typed vehicle barriers, but only inside the protected estate, which the user mostly avoids.
- The park polygon layers say where parks are, not whether a vehicle can get in.

### Land tenure (labelling only)

- **Call:** a point query on `PlanningCadastre/LandParcelPropertyFramework/MapServer/4/query` with `outFields=lotplan,tenure,parcel_typ,shire_name` returns tenure, parcel type and council in one call (0.2–0.3 s each; 78 calls took 20 s). The server sends no rate-limit headers and caps a query at 4,000 records. BCC's Opendatasoft API allows 5,000 calls a day (`x-ratelimit-limit: 5000`).
- **Values:** Freehold, Reserve, State Land, National Park, Lands Lease, Easement, Main Road, Railway, State Forest, Industrial Estates. Road parcels have null tenure, `parcel_typ` = "Road Type Parcel" and the road name in `feat_name`.
- **Gap:** council-owned parkland is Freehold, the same as private land (park-ups 1, 2, 3, 5, 8, 10). In Brisbane, a second point query against BCC *Council Vegetation* fixes this: 1, 3, 5, 8 and 10 fall inside it, and 2, 7, 9 and 11 are within 50 m. Outside Brisbane, council freehold stays ambiguous.
- **Card label:** "Public: state forest / national park / reserve / council land / road reserve", otherwise "Freehold (owner unknown)". This is a label only and never filters.

## Recommendation

Build the off-road generator on OSM, with one BCC layer and imagery to finish:

1. **Car parks:** OSM `amenity=parking`, off-street, excluding `access=private|customers|no` and `fee=yes`. Rank `access=yes|permissive` above untagged.
2. **Tracks:** OSM `highway=track` reachable from a public road without crossing a mapped `barrier=*` or an `access=no|private` way. Keep `motor_vehicle=private` as a flag. Generate candidate points where a track leaves the road and at clearings along it, and attach QLD Roads and Tracks `trafficability` where a segment matches.
3. **Council parks:** BCC Tracks and Trails `ACCESS ROAD` and `MULTI-USE ACCESS` lines that OSM lacks.
4. **Edges:** the edges of `landuse=industrial` (especially `industrial=mine`) within 100 m of a public road or track, plus `leisure=slipway` and `tourism=camp_site` rest areas.
5. **Imagery evaluation** decides gate, signs, surface and whether a clearing exists. Mapped gates rule sites out; their absence proves nothing.
6. **Tenure label** from one DCDB point query, plus BCC Council Vegetation in Brisbane, shown on the card only.

Around Taringa, Indooroopilly and St Lucia this yields mainly car parks (48 untagged-or-public, fee-free off-street car parks) and a handful of park access roads. Tracks only matter once the area extends west to Mt Coot-tha and D'Aguilar.

## Sources

- OpenStreetMap via the Overpass API (`overpass-api.de`), queried 2026-10-01: Taringa, Indooroopilly and St Lucia admin relations 11677828, 11677824 and 11677827; Brisbane LGA as area 3611677792 (relation 11677792, "City of Brisbane", admin_level 6); `around:100` and `around:250` per park-up. © OpenStreetMap contributors, ODbL 1.0.
- OSM Wiki: [Tag:highway=track](https://wiki.openstreetmap.org/wiki/Tag:highway%3Dtrack), [Tag:amenity=parking](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dparking), [Key:access](https://wiki.openstreetmap.org/wiki/Key:access), [Tag:barrier=gate](https://wiki.openstreetmap.org/wiki/Tag:barrier%3Dgate).
- BCC Open Data (Opendatasoft Explore API v2.1, `https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/`): `tracks-and-trails`, `protected-vegetation-natural-assets-local-law-2003-council-vegetation`, `cp14-zoning-overlay`; CC BY 4.0 per catalogue metadata. Rate limit from the `x-ratelimit-limit` response header.
- QLD Spatial ArcGIS REST (`https://spatial-gis.information.qld.gov.au/arcgis/rest/services/`): `PlanningCadastre/LandParcelPropertyFramework/MapServer/4` (parcels) and `/20` (council areas); `Environment/ParksTerrestrialProtectedAreas/MapServer/1,2,4–10`; `Transportation/RoadsAndTracks/MapServer/10`; `Structure/PhysicalInfrastructure/MapServer/60,260`; `Farming/StockRoutesQld/MapServer/15`. Point and buffer queries per park-up.
- Queensland Government Open Data (CKAN `https://www.data.qld.gov.au/api/3/`) for dataset discovery and licences.
