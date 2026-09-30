# Council data semantics

Research for [#2](https://github.com/XDGFX/parkup/issues/2). Data pulled on 30 September 2026 from the Brisbane City Council (BCC) Opendatasoft portal. `parking-sign-locations` was last modified on 21 September 2026 and has 51,984 records.

## Answer in brief

- Each record is one sign plate at a point. No record carries a kerb length, a side-of-road flag or a facing bearing. Kerb stretches have to be built by pairing plates, following the road rules on arrows.
- Arrows follow s 332 of the Queensland road rules. A kerb-side sign applies from the sign, in the direction of its arrow, to the nearest opposite-arrow parking sign on that side, a yellow edge line, or the end of the road at a T-intersection or dead end.
- `signdirection` is the arrow on the plate. `Left` and `Right` are one-way arrows, `Bi-Directional` is a double arrow (a repeater inside a stretch) and `Not applicable` means no arrow, as on area signs. The last letter of `bccallocationcode` gives the same information.
- `multisignsegment = 1` marks a plate that shares a post with other plates. `relatedsigns` is a 0/1 flag whose meaning is not published (see below).
- Area-wide rules such as the St Lucia Traffic Area appear only as entry and exit signs. The time limit itself is in no field, and the area polygon is in a separate dataset.
- `parkingrestrictiondaysandtimes` is loosely formatted free text: 127 distinct values across the three suburbs, in at least three time styles and with missing day tokens. A tolerant parser is needed.
- The toilets dataset is BCC's filtered copy of the National Public Toilet Map. It already includes Queensland Rail stations, service stations and shopping centres, and `openinghours` is free text.

## Sources

- BCC dataset metadata and records API: <https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/parking-sign-locations>. Every field `description` is `null`, so BCC publishes no data dictionary. The field labels are the only official semantics: `bccallocationcode` is "BCC Code For Signs", `multisignsegment` is "Multi-sign Plate", `relatedsigns` is "Related Signs", `parkingrestrictiondescription` is "Additional Sign Text".
- *Transport Operations (Road Use Management—Road Rules) Regulation 2009* (Qld), current as at 31 August 2026, ss 167, 168, 318, 332–335: <https://www.legislation.qld.gov.au/view/pdf/inforce/current/sl-2009-0194>.
- *St Lucia Traffic Area Regulated Parking Local Law 1998* (consolidated 19 February 2013): <https://www.brisbane.qld.gov.au/content/dam/brisbanecitycouncil/corpwebsite/laws-and-permits-/documents/st-lucia-traffic-area-regulated-parking-local-law-1998.pdf>.
- BCC, *Traffic and parking permit areas*: <https://www.brisbane.qld.gov.au/transport-and-parking/parking/traffic-and-parking-permit-areas>.
- BCC dataset `parking-regulated-permit-parking-areas` (34 polygons): <https://data.brisbane.qld.gov.au/explore/dataset/parking-regulated-permit-parking-areas/>.
- BCC dataset `public-toilets-in-brisbane` (582 records): <https://data.brisbane.qld.gov.au/explore/dataset/public-toilets-in-brisbane/>. Upstream: National Public Toilet Map, <https://data.gov.au/data/dataset/national-public-toilet-map>.
- OpenStreetMap via the Overpass API, used for the Adsett Street centreline and to count toilets.

Findings marked **inferred** come from patterns in the data, not from a published definition.

## 1. What a sign record is

One record is one sign plate (`assetid`, for example `SN-10-1000-1215264`) at one point (`geo_point_2d`; `geo_shape` is the same point). Across the whole dataset:

- 51,456 points hold one record each. 236 points hold 2–4 records, which are several plates on one post captured at exactly the same coordinate.
- In the three suburbs all 2,239 records have `assetlifecycle = In Service` and `signtemporary = 0`. 22 have `signowner = Other` (not BCC).
- The kerb stretch a sign governs is not stored. It has to be derived.

### `signdirection` (the arrow on the plate)

| Value | Taringa + Indooroopilly + St Lucia | Meaning |
|---|--:|---|
| `Right` | 807 | single arrow pointing right |
| `Left` | 804 | single arrow pointing left |
| `Bi-Directional` | 541 | double-headed arrow: a repeater, with the restriction continuing both ways |
| `Not applicable` | 81 | no arrow: area signs, end-of-area signs, some zone plates |
| `unknown` | 6 | not recorded |

The field records the arrow, not the side of the road. **Inferred:** Left and Right read as you look at the plate from the carriageway. Adsett Street (below) pairs up correctly on both kerbs under this reading. I have not confirmed it against BCC or a site visit.

### `bccallocationcode` ("BCC Code For Signs")

**Inferred:** this is BCC's internal plate catalogue code. The layout is `<restriction number><variant letters><arrow>[rx]`:

- The leading number matches `parkingrestrictioncode` in most rows: `1` No Stopping, `3` No Parking, `62` 2P, `20` Bus Zone, `43` Loading Zone Passengers, `92` Clearway, `SLTA` St Lucia Traffic Area.
- The last letter before any `rx` is the arrow. Across all 51,984 records, `L` gives `Left` 20,167 times, `R` gives `Right` 20,272 times and `D` gives `Bi-Directional` 10,167 times, with fewer than five exceptions. The field is therefore redundant with `signdirection`.
- A trailing `rx` appears on 2P, meter and pay-by-app plates, almost all of which carry the text "RESIDENT PERMITS EXCEPTED". It most likely means residents excepted.
- The middle letters (`W`, `Z`, `T`, `PY`, `EE`, `NN`, `BB` and so on) pick a plate variant, such as a particular times panel. They are not decoded here, and parkup does not need them because the times and text have their own fields.

### `multisignsegment` ("Multi-sign Plate")

A 0/1 flag. **Inferred:** 1 means the plate shares a post with other plates. In Taringa, 49 of 50 plates flagged 1 have another sign within 3 m. Only 4 of 385 plates flagged 0 do. Every post with co-located records is flagged 1 on all of its plates, apart from 66 unflagged pairs. Plates on one post should be read together: for example, a "2P 7am–6pm" plate above a "No Stopping" plate.

### `relatedsigns` ("Related Signs")

A 0/1 flag, set to 1 on 1,960 of the 2,239 records. **Not confirmed.** The best guess is that 1 means "part of a sequence with other signs of the same restriction". Among the local plates flagged 1, 97% have a sign of the same type on the same street within 100 m. For plates flagged 0 the figure is about 65%. Every `Not applicable` (no-arrow) plate is flagged 0. It is too weak to rely on. Pairing should use geometry and arrows.

### Other fields

- `parkingrestrictiontype`: the main legend, for example "2P Parallel" or "No Parking Specified Times". `signcategory` groups these types (No Stopping, Parallel Parking, Clearway, Traffic Parking Control Areas, and so on).
- `parkingrestrictioncode`: a short code for the type.
- `parkingrestrictiondescription`: extra plate text, for example "RESIDENT PERMITS EXCEPTED" (433 locally), "TOW AWAY", "ANGLE", or "ST LUCIA TRAFFIC AREA,FEB-NOV,EXCEPT AS SIGNED".
- `parkingrestrictiondaysandtimes`: when the restriction applies. See section 4.
- Not in the issue's field list: `sapobjnr`, `sapbusid`, `globalid`, `suburb_list`.

## 2. How arrows define a kerb stretch (Queensland)

Road rules, s 332(1): *"If a parking control sign displays an arrow and is at the side of a road, then, unless information on or with the sign indicates otherwise, the sign applies to the length of road between the sign and the nearest (in the direction indicated by the arrow) of the following—(a) a parking control sign at that side of the road that displays an arrow indicating the opposite direction; (b) a yellow edge line on the road; (c) if the road ends at a T-intersection or dead end—the end of the road."* Section 332(2) says the same for signs at the centre of the road or on a dividing strip.

Further rules:

- s 333: a sign for a length of road inside an area overrides the area-wide sign on that length.
- s 334: without bays, the sign covers the 3 m nearest the kerb, or 6 m for angle parking. With bays, it covers only the bays.
- s 335(2): an area sign applies to an area when the same device stands on every road into the area and an "end" sign stands on every road out.
- ss 167–168: no stopping, and no parking except to pick up or drop off, within 2 minutes by default.

Consequences for parkup:

1. A stretch runs from a one-way arrow plate to the nearest plate with the opposite arrow **on the same kerb**. `Bi-Directional` plates are repeaters inside a stretch. They neither start nor end one.
2. The side of the road has to come from geometry: the sign point's offset from a road centreline. The data has no side field.
3. A kerb with no plates between two stretches carries no sign restriction. It is still subject to the general rules, such as s 170 on intersections, and to any area-wide rule (section 3).

### Worked example: Adsett Street, Taringa

Adsett Street runs roughly north–south. Sides come from each point's offset from the OpenStreetMap centreline, and plates are listed north to south.

| Side | Lat | Code | Type | Times |
|---|---|---|---|---|
| W | -27.49295 | 3WL | No Parking Specified Times | MON-FRI:7am-6pm |
| W | -27.49337 | 3WR | No Parking Specified Times | MON-FRI:7am-6pm |
| W | -27.49337 | 7L | P Angle (No Limit) | – |
| W | -27.49350 | 7R | P Angle (No Limit) | – |
| W | -27.49388 | 3WL | No Parking Specified Times | MON-FRI:7am-6pm |
| W | -27.49432 | 3WR | No Parking Specified Times | MON-FRI:7am-6pm |
| W | -27.49626 | 1L | No Stopping Any Time | – |
| W | -27.49666 | 1R | No Stopping Any Time | – |
| E | -27.49351 | 3WR | No Parking Specified Times | MON-FRI:7am-6pm |
| E | -27.49374 | 3WD | No Parking Specified Times (repeater) | MON-FRI:7am-6pm |
| E | -27.49399 | 3WL | No Parking Specified Times | MON-FRI:7am-6pm |
| E | -27.49455 | 3WR | No Parking Specified Times | MON-FRI:7am-6pm |
| E | -27.49517 | 3WL | No Parking Specified Times | MON-FRI:7am-6pm |

Read from the road, left points south on the west kerb and north on the east kerb. Each L pairs cleanly with the next R on the same kerb, and the D plate falls inside a stretch. This gives:

- West: no parking on weekdays 7am–6pm for about 47 m at the north end. An angle-parking stretch of about 14 m with no limit. A second weekday no-parking stretch of about 49 m. No stopping for about 45 m at the southern (Moggill Road) end.
- East: two weekday no-parking stretches of about 53 m and 69 m.
- The kerb between these stretches has no plates. For a van, every weekday no-parking stretch is legal overnight (6pm–7am) and at weekends.

## 3. Area-wide restrictions (Traffic Areas, Parking Areas, RPP areas)

Area rules appear in the sign data only as boundary signs. Locally these are all in St Lucia:

| `parkingrestrictiontype` | `parkingrestrictiondescription` | `parkingrestrictiondaysandtimes` | Count |
|---|---|---|--:|
| ST LUCIA TRAFFIC AREA (code `SLTA`) | ST LUCIA TRAFFIC AREA,FEB-NOV,EXCEPT AS SIGNED (+1 "ST LUCIA PARKING AREA…") | MON-FRI 7am–6pm (3 time spellings) | 16 |
| ST LUCIA TRAFFIC AREA (code `SLTA`) | PARKING AREA[,METER][,ANGLE],EXCEPT AS SIGNED | MON-FRI 7am–9pm (4 spellings) | 26 |
| End Traffic Parking Control Area (code `PA6`) | – / ANGLE | – | 16 |

All have `signdirection = Not applicable`. Note:

- **The time limit is in no field.** The type says "ST LUCIA TRAFFIC AREA", not "2P". BCC says most Traffic Areas carry a 2-hour limit, 7am–6pm Monday–Friday, that *"signed street parking restrictions override area-wide conditions"*, and that the St Lucia Traffic Area runs February–November. (BCC traffic and permit areas page. The months also appear in the sign text.)
- Under the local law, the area is *"defined by the black bordering indicated on the map in the Schedule"* (s 4). The Council sets the hours, days and maximum time (s 6(4)), and the rule only takes effect once signs stand *"at every road entry"* (s 7). This matches road rules s 335(2).
- The "PARKING AREA,METER … 7am–9pm" signs look like a separately signed metered area inside or next to the traffic area, probably around UQ. **Not confirmed.** Its limit and tariff are not in the data.
- The **polygons** are in `parking-regulated-permit-parking-areas`. It includes "ST LUCIA TRAFFIC AREA", "ST LUCIA REGULATED PARKING PERMIT AREA" and "TARINGA REGULATED PARKING PERMIT AREA". Its `operational_time` and `type` are `null`, so hours and limits still have to be entered by hand.
- In Taringa and Indooroopilly, the permit-area restrictions appear as ordinary arrowed kerb plates: "2P Parallel" with "RESIDENT PERMITS EXCEPTED" and `rx` codes. They behave like any other stretch.
- For parkup: a kerb inside the SLTA polygon with no plates should be treated as 2P, Mon–Fri 7am–6pm, February–November. That is legal overnight but not for a weekday daytime stay. Any kerb plate overrides it on its stretch (s 333).
- Across the whole city, `signcategory = Traffic Parking Control Areas` also covers Brisbane Central, Lang Park, The Gabba, Robertson/Macgregor, Ballymore, Dutton Park, Queensland Tennis Centre and "Traffic Area Ahead" signs, plus 145 end signs.

## 4. Counts for Taringa, Indooroopilly and St Lucia

2,239 records: Taringa 435, Indooroopilly 720, St Lucia 1,084.

### `parkingrestrictiondaysandtimes`: formats

1,114 records have a value and 1,125 are `null`. The grammar is roughly `DAYS:TIME-TIME` clauses joined by `" ,"` (space, comma). 940 values have one clause and 174 have two.

Day tokens, counted per clause and weighted by records:

- `MON-FRI` 891
- empty (for example `:7am-9am`) 111
- `SCHOOLDAYS` 85
- `SAT` 66
- `MON-SAT` 63
- `SCHOOL DAYS` 25
- literal `null` 16
- `TUESDAY` 8
- `ALL OTHER TIMES` 8
- `AT ALL TIMES` 6
- `DAILY` 4
- `SUN` 2
- `MON-SUN` 2
- `FRIDAY` 1

Parser points:

- An **empty or `null` day** almost always comes before a second clause with days (`:7am-9am ,SCHOOLDAYS:2pm-4pm`). **Inferred:** the plate shows "7–9am, 2–4pm SCHOOL DAYS", so the trailing day token covers both clauses. A lone empty day (`:9:30PM-7:00AM`, `:4-6:30pm`) means every day.
- Time styles:
  - lower-case compact (`7am-6pm`, `4-6:30pm`, `12noon`): 1,016 clauses.
  - upper-case padded (`7:00AM-6:00PM`, `12:00AM`): 150.
  - spaced (`7 AM-6 PM`, `12 NOON`): 103.
  - empty (`ALL OTHER TIMES:-`, `AT ALL TIMES:-`): 15.
  - no am/pm at all (`7:30-9:30`): 2.
- The first time may drop its am/pm (`4-6:30pm`, `7-9:30am`). Take it from the second time unless that gives start > end.
- Some values look like typos (`:4-6:30am` after `:7-9:30am`, where pm is plausible). Indooroopilly Shopping Centre's toilet shows the same kind of slip (`9am-5:30am`).
- `null` does not always mean "at all times". 12 "No Parking Specified Times" plates, 5 "No Stopping Specified Times" plates and 25 "2P Parallel" plates have `null` times. Treat a "Specified Times" type with `null` times as unknown, not as all day.
- Months never appear in this field. They are only in the description text (`FEB-NOV`).
- Public holidays are never stated. Road rules s 318(3) settles them: a device that *"applies on a particular day of the week"* has no effect on a public holiday *"unless information on the device states otherwise"*. For example, a MON-FRI restriction lapses on a weekday public holiday. `DAILY` and `AT ALL TIMES` name no particular weekday, so they arguably still apply.

Full value list:

| parkingrestrictiondaysandtimes | Taringa | Indooroopilly | St Lucia | Total |
|---|--:|--:|--:|--:|
| `(null)` | 209 | 411 | 505 | 1125 |
| `MON-FRI:7am-6pm` | 22 | 2 | 311 | 335 |
| `MON-FRI:7am-7pm` | 94 | 9 | 30 | 133 |
| `MON-FRI:8am-5:30pm` | 16 | 17 | 27 | 60 |
| `MON-FRI:9am-5pm` | 0 | 22 | 21 | 43 |
| `MON-FRI:8am-5:30pm ,SAT:8am-12noon` | 19 | 8 | 6 | 33 |
| `:7am-9am ,SCHOOLDAYS:2pm-4pm` | 0 | 23 | 4 | 27 |
| `MON-FRI:4-6:30pm` | 0 | 0 | 22 | 22 |
| `MON-SAT:7:00AM-7:00PM` | 6 | 15 | 0 | 21 |
| `MON-FRI:7am-9pm` | 0 | 0 | 19 | 19 |
| `MON-FRI:9am-4pm` | 4 | 11 | 4 | 19 |
| `MON-FRI:7am-4pm` | 0 | 0 | 18 | 18 |
| `MON-FRI:7:00AM-6:00PM` | 0 | 0 | 18 | 18 |
| `MON-FRI:8am-4pm` | 10 | 0 | 4 | 14 |
| `MON-FRI:9 AM-5 PM` | 0 | 11 | 3 | 14 |
| `:8am-9am ,SCHOOLDAYS:2:30pm-3:30pm` | 0 | 13 | 0 | 13 |
| `SCHOOLDAYS:8am-4pm` | 0 | 12 | 0 | 12 |
| `MON-SAT:7am-7pm` | 4 | 8 | 0 | 12 |
| `MON-FRI:7am-9am` | 6 | 5 | 0 | 11 |
| `MON-FRI:7 AM-6 PM` | 0 | 0 | 11 | 11 |
| `MON-SAT:8:00AM-6:00PM` | 0 | 10 | 0 | 10 |
| `:7am-9am ,MON-FRI:4pm-6pm` | 0 | 9 | 0 | 9 |
| `MON-FRI:7:00AM-7:00PM` | 9 | 0 | 0 | 9 |
| `MON-FRI:7 AM-7 PM` | 3 | 1 | 4 | 8 |
| `ALL OTHER TIMES:-` | 2 | 6 | 0 | 8 |
| `MON-FRI:7am-5pm` | 0 | 7 | 0 | 7 |
| `MON-FRI:7am-12noon` | 0 | 7 | 0 | 7 |
| `AT ALL TIMES:-` | 0 | 0 | 6 | 6 |
| `TUESDAY:7:00AM-12:00PM` | 0 | 0 | 6 | 6 |
| `MON-FRI:8 AM-5 PM` | 0 | 6 | 0 | 6 |
| `:7:30AM-9:15AM ,SCHOOLDAYS:2:00PM-4:00PM` | 0 | 0 | 6 | 6 |
| `:7:30-9:30am ,SCHOOLDAYS:2pm-4pm` | 0 | 0 | 5 | 5 |
| `MON-FRI:8 AM-5:30 PM` | 0 | 0 | 4 | 4 |
| `MON-FRI:9am-6pm ,SAT:6am-12noon` | 0 | 4 | 0 | 4 |
| `SCHOOLDAYS:7:30am-3:30pm` | 0 | 4 | 0 | 4 |
| `SCHOOL DAYS:9 AM-5 PM` | 0 | 4 | 0 | 4 |
| `SCHOOL DAYS:2 PM-4 PM` | 0 | 4 | 0 | 4 |
| `MON-FRI:7 AM-9 PM` | 0 | 0 | 4 | 4 |
| `:7am-9am ,MON-FRI:2pm-4pm` | 0 | 4 | 0 | 4 |
| `:7am-9am ,MON-FRI:4pm-7pm` | 0 | 0 | 4 | 4 |
| `MON-FRI:7am-5pm ,SAT:8am-5pm` | 0 | 3 | 0 | 3 |
| `:7-9:30am ,:4-6:30pm` | 0 | 0 | 3 | 3 |
| `MON-SAT:3-7pm` | 0 | 3 | 0 | 3 |
| `SCHOOLDAYS:2pm-4pm` | 0 | 3 | 0 | 3 |
| `MON-FRI:8am-5:30pm ,SAT:8am-4pm` | 0 | 3 | 0 | 3 |
| `MON-FRI:8:00AM-5:30PM ,SAT:8:00AM-12:00PM` | 2 | 1 | 0 | 3 |
| `MON-FRI:8:00AM-5:30PM` | 0 | 1 | 2 | 3 |
| `SCHOOLDAYS:4pm-6pm` | 0 | 0 | 3 | 3 |
| `:7:00AM-9:00AM ,SCHOOL DAYS:2:00PM-4:00PM` | 0 | 3 | 0 | 3 |
| `MON-FRI:7:00AM-9:00PM` | 0 | 0 | 3 | 3 |
| `:8:00AM-9:00AM ,MON-FRI:2:30PM-3:30PM` | 0 | 3 | 0 | 3 |
| `MON-FRI:7 AM-5 PM` | 0 | 3 | 0 | 3 |
| `MON-FRI:9:00AM-5:00PM` | 0 | 3 | 0 | 3 |
| `SCHOOLDAYS:3:10-3:30pm` | 0 | 2 | 0 | 2 |
| `MON-FRI:9am-4pm ,SAT:9am-12noon` | 0 | 0 | 2 | 2 |
| `MON-SAT:9am-5pm` | 0 | 2 | 0 | 2 |
| `null:7 AM-9 AM ,SCHOOL DAYS:2 PM-4 PM` | 0 | 2 | 0 | 2 |
| `SCHOOL DAYS:8:00AM-4:00PM` | 0 | 2 | 0 | 2 |
| `MON-FRI:7:00AM-5:00PM ,SAT:8:00AM-5:00PM` | 0 | 2 | 0 | 2 |
| `MON-FRI:9 AM-7 PM ,SAT:9 AM-12 NOON` | 2 | 0 | 0 | 2 |
| `MON-FRI:8 AM-4 PM` | 0 | 2 | 0 | 2 |
| `MON-FRI:9am-4pm ,SAT:8-11am` | 0 | 2 | 0 | 2 |
| `:8:00AM-10:00AM ,MON-FRI:2:00PM-4:00PM` | 0 | 0 | 2 | 2 |
| `DAILY:7:00AM-8:30PM` | 0 | 2 | 0 | 2 |
| `null:7 AM-9 AM ,null:2 PM-4 PM` | 0 | 0 | 2 | 2 |
| `MON-FRI:6:30AM-4:30PM ,SAT:7:00AM-12:00PM` | 0 | 2 | 0 | 2 |
| `MON-FRI:6:00AM-11:00AM` | 2 | 0 | 0 | 2 |
| `MON-FRI:4pm-7pm` | 2 | 0 | 0 | 2 |
| `MON-FRI:9am-5:30pm` | 2 | 0 | 0 | 2 |
| `MON-FRI:6am-3pm` | 2 | 0 | 0 | 2 |
| `null:7 AM-9 AM ,MON-FRI:2-5 PM` | 0 | 2 | 0 | 2 |
| `MON-SAT:8 AM-6 PM` | 0 | 2 | 0 | 2 |
| `MON-FRI:9am-3pm` | 2 | 0 | 0 | 2 |
| `MON-FRI:4:00PM-9:00PM ,SAT:8:00PM-12:00AM` | 2 | 0 | 0 | 2 |
| `SCHOOL DAYS:7:00AM-8:00AM` | 0 | 2 | 0 | 2 |
| `:7-9:30am ,:4-6:30am` | 0 | 0 | 2 | 2 |
| `MON-SAT:4pm-6pm` | 0 | 2 | 0 | 2 |
| `:8:30-9:30am ,SCHOOLDAYS:2pm-3pm` | 2 | 0 | 0 | 2 |
| `:7:30-9:30 ,SCHOOLDAYS:2pm-4pm` | 0 | 0 | 2 | 2 |
| `MON-SAT:7am-5pm` | 0 | 2 | 0 | 2 |
| `:7am-9am ,MON-SAT:5-7pm` | 0 | 2 | 0 | 2 |
| `SUN:8:00AM-1:00PM` | 0 | 0 | 2 | 2 |
| `MON-SUN:9am-5pm` | 0 | 2 | 0 | 2 |
| `MON-SAT:4:00PM-7:00PM` | 0 | 2 | 0 | 2 |
| `SAT:8am-4pm` | 0 | 2 | 0 | 2 |
| `:7am-9am ,SCHOOLDAYS:2-4pm` | 0 | 2 | 0 | 2 |
| `:9:30AM-2:00PM ,MON-FRI:3:00PM-5:00PM` | 0 | 2 | 0 | 2 |
| `SCHOOLDAYS:9am-2pm` | 0 | 2 | 0 | 2 |
| `SCHOOL DAYS:2:30 PM-3:30 PM` | 0 | 2 | 0 | 2 |
| `SCHOOLDAYS:7am-7pm` | 0 | 0 | 2 | 2 |
| `MON-SAT:6:30am-6:30pm` | 2 | 0 | 0 | 2 |
| `:8:00AM-9:00AM ,SCHOOL DAYS:2:00PM-4:00PM` | 0 | 2 | 0 | 2 |
| `DAILY:10pm-6am` | 0 | 2 | 0 | 2 |
| `MON-FRI:9am-4pm ,SAT:9am-12NOON` | 0 | 0 | 2 | 2 |
| `null:9 AM-2 PM` | 0 | 2 | 0 | 2 |
| `:4-6:30pm` | 0 | 0 | 2 | 2 |
| `:9:30PM-7:00AM` | 0 | 2 | 0 | 2 |
| `:7-9:30am ,MON-FRI:4-6:30pm` | 0 | 0 | 2 | 2 |
| `:7am-9am ,MON-FRI:3-7pm` | 2 | 0 | 0 | 2 |
| `MON-FRI:6:00AM-6:00PM` | 1 | 0 | 0 | 1 |
| `:7am-6pm` | 0 | 0 | 1 | 1 |
| `MON-SAT:7 AM-7 PM` | 0 | 1 | 0 | 1 |
| `null:8:30-9:30 AM ,MON-FRI:2 PM-3 PM` | 0 | 1 | 0 | 1 |
| `SCHOOL DAYS:8 AM-4 PM` | 0 | 1 | 0 | 1 |
| `null:8 AM-9 AM ,SCHOOL DAYS:2:30 PM-3:30 PM` | 0 | 1 | 0 | 1 |
| `:7 AM-9 AM ,SCHOOL DAYS:2 PM-4 PM` | 0 | 1 | 0 | 1 |
| `null:7 AM-6 PM` | 0 | 0 | 1 | 1 |
| `null:7 AM-9 AM ,MON-FRI:3-6 PM` | 1 | 0 | 0 | 1 |
| `SCHOOL DAYS:7:00AM-9:00AM` | 0 | 1 | 0 | 1 |
| `TUESDAY:7 PM-MIDNIGHT` | 0 | 0 | 1 | 1 |
| `FRIDAY:7 AM-1 PM` | 1 | 0 | 0 | 1 |
| `MON-FRI:7:00AM-1:00PM` | 1 | 0 | 0 | 1 |
| `:7am-9am ,MON-FRI:3-6pm` | 1 | 0 | 0 | 1 |
| `TUESDAY:7 AM-12 NOON` | 0 | 0 | 1 | 1 |
| `null:9:30 AM-2 PM ,MON-FRI:3-5 PM` | 0 | 1 | 0 | 1 |
| `:7am-9pm` | 0 | 0 | 1 | 1 |
| `MON-FRI:7-6 PM` | 0 | 0 | 1 | 1 |
| `MON-FRI:8 AM-5:30 PM ,SAT:8 AM-12 NOON` | 0 | 1 | 0 | 1 |
| `:7:00AM-5:30PM` | 0 | 0 | 1 | 1 |
| `MON-FRI:7AM-7PM` | 1 | 0 | 0 | 1 |
| `MON-FRI:8:30am-5:30pm ,SAT:8am-12noon` | 1 | 0 | 0 | 1 |
| `MON-SAT:-` | 0 | 0 | 1 | 1 |
| `null:7-6 PM` | 0 | 0 | 1 | 1 |
| `MON-FRI:8:00AM-5:30PM ,SAT:8:00AM-4:00PM` | 1 | 0 | 0 | 1 |
| `MON-FRI:2:30PM-3:30PM` | 0 | 0 | 1 | 1 |
| `MON-FRI:8am-5:30pm ,SAT:8am-12:30pm` | 1 | 0 | 0 | 1 |
| `MON-FRI:2-3:30pm ,MON-FRI:2:30PM-3:30PM` | 0 | 0 | 1 | 1 |
| `MON-SAT:4 PM-7 PM` | 0 | 1 | 0 | 1 |

### `parkingrestrictiontype` (all 41 values)

| parkingrestrictiontype | Taringa | Indooroopilly | St Lucia | Total |
|---|--:|--:|--:|--:|
| `No Stopping Any Time` | 108 | 256 | 283 | 647 |
| `2P Parallel` | 141 | 82 | 358 | 581 |
| `Bus Zone` | 42 | 56 | 63 | 161 |
| `No Stopping Specified Times` | 17 | 62 | 50 | 129 |
| `No Parking Specified Times` | 35 | 16 | 67 | 118 |
| `No Parking Any Time` | 11 | 21 | 41 | 73 |
| `Loading Zone Passengers 2 Min. Max` | 4 | 35 | 27 | 66 |
| `1/4P Parallel` | 14 | 27 | 11 | 52 |
| `Clearway C Linear Repeater-Specified Times` | 20 | 26 | 0 | 46 |
| `ST LUCIA TRAFFIC AREA` | 0 | 0 | 42 | 42 |
| `4P Parallel` | 2 | 37 | 2 | 41 |
| `Loading Zone` | 5 | 12 | 21 | 38 |
| `1P Parallel` | 4 | 13 | 14 | 31 |
| `Bus Zone BCC` | 12 | 2 | 6 | 20 |
| `P (No Limit)` | 0 | 0 | 18 | 18 |
| `Loading Zone - Passenger 2 Min. Max, Commercial Vehicles 20 Min. Max` | 4 | 9 | 4 | 17 |
| `Mail Zone or Australia Post Mail Box` | 4 | 8 | 4 | 16 |
| `End Traffic Parking Control Area` | 0 | 0 | 16 | 16 |
| `Taxi Zone` | 6 | 7 | 1 | 14 |
| `3P Parallel` | 2 | 2 | 9 | 13 |
| `P 10 Minute Parallel` | 2 | 9 | 2 | 13 |
| `1/2P Parallel` | 0 | 6 | 4 | 10 |
| `P 2 Minute Parallel` | 0 | 8 | 0 | 8 |
| `Accessible Parking` | 0 | 1 | 7 | 8 |
| `Loading Zone Commercial Vehicle 20 Min. Max` | 0 | 2 | 6 | 8 |
| `Clearway C` | 0 | 7 | 0 | 7 |
| `No Stopping Authorised Vehicle Excepted` | 0 | 0 | 6 | 6 |
| `4P Angle` | 0 | 2 | 4 | 6 |
| `2P Angle` | 0 | 2 | 3 | 5 |
| `P Angle (No Limit)` | 2 | 0 | 3 | 5 |
| `P 10 Minute Angle` | 0 | 2 | 2 | 4 |
| `1P Angle` | 0 | 3 | 0 | 3 |
| `1(1/2)P Parallel` | 0 | 0 | 3 | 3 |
| `P 15 Minute Parallel` | 0 | 0 | 2 | 2 |
| `3P Angle` | 0 | 2 | 0 | 2 |
| `End C` | 0 | 2 | 0 | 2 |
| `P 5 Minute Parallel` | 0 | 0 | 2 | 2 |
| `1/2P Angle` | 0 | 2 | 0 | 2 |
| `Works Zone (Construction Vehicles)` | 0 | 0 | 2 | 2 |
| `14P Parallel` | 0 | 0 | 1 | 1 |
| `No Stopping Police Vehicle Excepted` | 0 | 1 | 0 | 1 |

## 5. Public toilets (`public-toilets-in-brisbane`)

BCC describes the dataset as *"created by Brisbane City Council using The National Public Toilet Map website data … filtered to show toilets in the Brisbane City Council Local Government Area"*. It has 582 records and was last modified on 29 September 2026. Each record links to `toiletmap.gov.au/facility/<id>`.

Fields:

- `facilityid`, `name`, `facilitytype`, `address1`, `town` (mixed case, for example "St Lucia"), `state`, `addressnote`, `latitude`, `longitude`, `geopoint`
- Parking: `parking`, `parkingaccessible`, `parkingnote`
- Access: `keyrequired`, `mlak24`, `mlakafterhours`, `paymentrequired`, `accessnote`
- Hours: **`openinghours`**, **`openinghoursnote`**
- Facilities: `male`, `female`, `unisex`, `allgender`, `ambulant`, `accessible`, `lhtransfer`, `rhtransfer`, `adultchange`, `changingplaces`, `byosling`, `acshower`, `acmlak`, `babychange`, `babycareroom`, and their notes
- `dumppoint`, `dpwashout`, `dpafterhours`, `dumppointnote`: relevant to vans
- `sharpsdisposal`, `drinkingwater`, `sanitarydisposal`, `menspaddisposal`, `shower`
- `rank`, `url`, `url_open_data_map`, `id`, `suburb_list`, `lga_name`, `lga_code`

Opening hours are free text prefixed `OPEN:`. The commonest values city-wide are `OPEN: Daylight hours` (256), `OPEN: 24 hours` (106) and `OPEN: Variable hours` (16). There are also day-and-time lists (`OPEN: Mon-Fri 5:15am-6:30pm`, `OPEN: Sun 10am-5pm, Mon-Wed,Fri 9am-7pm, …`) and `Currently closed` (6). "Daylight hours" has no machine-readable definition.

Taringa, Indooroopilly and St Lucia have 15 records:

| Name | Type | Suburb | `openinghours` |
|---|---|---|---|
| Guyatt Park | Park or reserve | St Lucia | 24 hours |
| St Lucia Playground Park | Park or reserve | St Lucia | Daylight hours |
| University of Queensland | Other | St Lucia | 8am–11pm |
| Taringa Playground Park | Park or reserve | Taringa | 24 hours |
| Robertson Park | Park or reserve | Taringa | Daylight hours |
| Taringa Railway Station | Train station | Taringa | Mon–Fri 5:15am–6:30pm |
| Indooroopilly Railway Station | Train station | Indooroopilly | Mon–Thu 5am–12am, Fri 5am–1am, Sat 4:25am–1am, Sun 4:30am–1:30pm |
| BP Moggill Road | Service station | Indooroopilly | 24 hours |
| Shell Coles Express Chapel Hill | Service station | Indooroopilly | Mon–Fri 5am–9pm, Sat 6am–9pm, Sun 6am–8pm |
| Indooroopilly Shopping Centre | Shopping centre | Indooroopilly | Mon–Wed, Fri 9am–5:30"am" [sic], Thu 9am–9pm, … |
| Centro Indooroopilly | Shopping centre | Indooroopilly | Mon–Wed, Fri 9am–5:30pm, … (+ holiday note) |
| Spotlight Indooroopilly | Shopping centre | Indooroopilly | Sun 10am–5pm, … |
| Moore Park | Park or reserve | Indooroopilly | 24 hours |
| Carinya Street Park | Park or reserve | Indooroopilly | Daylight hours |
| Sir John Chandler Park | Park or reserve | Indooroopilly | Daylight hours |

**Other sources.** Queensland Rail stations and service stations are already in this dataset, because the National Public Toilet Map covers non-council facilities. The upstream is the National Public Toilet Map on data.gov.au (CSV, JSON or XML; downloading requires accepting its terms). It has the same fields plus the rest of Australia, so it adds nothing inside Brisbane LGA. OpenStreetMap returns 59 `amenity=toilets` features in a box around the three suburbs plus parts of Toowong. Most are unnamed, many are `access=customers` or `private`, and only four carry `opening_hours`. OSM could catch extra locations but is poor for hours. I found no separate Queensland Rail toilet dataset.

## Open questions

- The Left and Right viewing convention holds on Adsett Street only. Test it on more streets or on site before relying on it.
- The meaning of `relatedsigns` is unknown. BCC's open-data team would be the ones to ask.
- The limit, tariff and extent of the St Lucia "PARKING AREA,METER … 7am–9pm" are not confirmed.
- The middle letters of `bccallocationcode` are not decoded. Probably not needed.
