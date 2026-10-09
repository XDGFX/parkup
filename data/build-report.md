# Build report

Snapshot taken 2026-10-01T06:25:28.165Z.

## Orientation

Share of 1592 arrow plates that pair cleanly with an opposite arrow on the same kerb:

| Reading | Clean-pairing share |
|---|---|
| Arrow read from the carriageway | 63% |
| Arrow read from the footpath | 12% |

Chosen: **carriageway**. The winner needs at least 60% and a 20-point lead (`ORIENTATION` in `src/build/config.ts`).

## Plates

| | Count |
|---|---|
| Plates in the snapshot | 2239 |
| Area plates (traffic area boundaries, end of clearway) | 60 |
| … of which metered parking areas, not yet applied | 18 |
| Not near a centreline | 58 |
| No arrow, on the plate or its post | 23 |
| Repeaters outside any paired stretch | 230 |

## Stretches

| | Count |
|---|---|
| Kerb stretches after trims | 2628 |
| … unsigned | 1940 |
| Dropped: shorter than 8 m | 908 |
| Dropped: fail both the overnight and daytime tests | 276 |
| Candidates | 2659 |
| … low confidence (unpaired arrow) | 145 |
| … day only | 7 |

## Trims and exclusions

| | Metres of kerb |
|---|---|
| Removed: OSM `parking:*=no` | 21343 |
| Excluded: faces CF5 Education purpose | 3872 |
| Excluded: faces CF4 Community purpose with a kindergarten or childcare centre | 137 |
| No frontage found within the probe | 6883 |

## School and kindergarten coverage

How many schools and kindergartens mapped in OSM fall in a zone the build excludes. Any outside one aren't excluded.

| | Mapped in OSM | In an excluded zone |
|---|---|---|
| Schools | 38 | 35 |
| Kindergartens and childcare | 40 | 9 |

## Frontage tiers

| Tier | Candidates |
|---|---|
| 1 | 507 |
| 2 | 627 |
| 3 | 1337 |
| No frontage | 188 |

## Sites

| | Count |
|---|---|
| Parking areas | 163 |
| Off-road sites | 144 |
| … with any timetable data (plates inside, `opening_hours`, `maxstay`, `fee:conditional`) | 1 |
| Dropped: fail both the overnight and daytime tests | 2 |

Sites without timetable data count as open at all times, with an "hours unknown" caution.

## Unparsed plate text

Each stretch is screened reading the plate strictly (the rule always applies) and leniently (it never applies).
Fails leniently: dropped. Passes strictly: a normal candidate. Passes only leniently: a candidate with an "unreadable sign" caution.
A row of zeros means the plate governs no stretch: it was unpaired, trimmed away or left under 8 m.

| Plates | Text | Stretches dropped | Normal | Unreadable-sign caution |
|---|---|---|---|---|
| 12 | `No Parking Specified Times: (no times)` | 0 | 0 | 2 |
| 6 | `P 10 Minute Parallel: (no times)` | 0 | 0 | 0 |
| 5 | `No Stopping Specified Times: (no times)` | 1 | 0 | 3 |
| 3 | `1/4P Parallel: (no times)` | 1 | 0 | 0 |
| 2 | `2P Parallel: ALL OTHER TIMES:-` | 0 | 0 | 0 |
| 2 | `Clearway C Linear Repeater-Specified Times: (no times)` | 0 | 0 | 0 |
| 2 | `Loading Zone Passengers 2 Min. Max: :7:30-9:30 ,SCHOOLDAYS:2pm-4pm` | 0 | 0 | 0 |
| 2 | `Loading Zone: (no times)` | 0 | 0 | 2 |
| 2 | `Loading Zone: ALL OTHER TIMES:-` | 0 | 0 | 1 |
| 2 | `No Stopping Specified Times: ALL OTHER TIMES:-` | 0 | 0 | 1 |
| 2 | `Taxi Zone: ALL OTHER TIMES:-` | 0 | 0 | 0 |
| 1 | `4P Parallel: (no times)` | 0 | 0 | 0 |
| 1 | `Bus Zone: MON-SAT:-` | 0 | 0 | 0 |
