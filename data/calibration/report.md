# Calibration report

**FAIL**: 23 of 31 match, 7 near misses involving maybe, 1 failure, 0 missing, 0 judged under another rubric.

Rule: every good and poor call of the user's must match; a known place the user calls maybe may come back good or poor.
Every known place must have been judged under the current rubric (v10).
Rubric v10, model claude-sonnet-5-5, run 2026-10-09.
Each known place's context and evaluation are in `data/calibration/<place>/`. Imagery is in the gitignored cache;
`npm run evaluate -- prepare --calibration` refetches it.

| Known place | You | Agent | Result | Agent's summary | Your note |
|---|---|---|---|---|---|
| heroes-ave | poor | poor | match | Through road beside a ballpark; no cars park along this kerb. | poor: main road with no clear parking. Would need a much wider kerb and other cars parking there. |
| keith-st | maybe | good | near miss | Bowls club kerb with other cars parked, no homes nearby, university opposite. | maybe throughout (revised in the 2026-10 review, was good on the lower section). |
| adsett-st | poor | poor | match | Short kerb with detached homes 4 to 6 m away on the same side. | poor: too close to houses to be useful. |
| marmion-pde | good | good | match | Kerb along a grassy park with homes only across the road. | good at chunk 3 only. Steep there, which is worth flagging but isn't a dealbreaker. |
| garden-car-park | good | good | match | Small gravel car park beside community garden and park, no homes near. | good: unsigned, checked in person. The gravel area north of Heroes Ave was the gold standard until a sign went up a couple of weeks ago. Review: decent, small and can be busy in the day. |
| pin03 | good | good | match | Gravel bushland car park beside Sir Samuel Griffith Drive, many cars, no homes. | good: I stay here often, very secluded. Road can be loud. Weekends get very busy with hikers. |
| pin05 | good | good | match | Boat-ramp car park beside Nudgee Creek, mangroves all round, no homes. | good: Stayed in a roof tent, had no issues. |
| pin06 | good | good | match | Roadside rest area loop with caravans and motorhomes already parked, bush all round. | good: Allowed free campground with toilets. |
| pin07 | good | good | match | Cleared gravel strip beside Boundary Road, tyre-marked, with open paddock and no homes. | good: I've stayed a few times. Anywhere else it's questionable; you shouldn't just drive off the road into a field without an obvious track. But here it's sandwiched between industrial zones and an airport, so I doubt anyone cares. I never had an issue. |
| pin08 | good | good | match | Gravel sports-ground car park with room for vans and no homes close. | good: Can be busy when football training is in the morning. |
| pin09 | good | maybe | **FAIL** | Narrow sealed park lane edged by gravel, homes beyond 40 m but open to view. | good: Large kerb/off road site far from houses. Good spot. |
| pin10 | good | good | match | Large sealed car park beside the railway, nearest homes about 65 m away. | good: Have stayed here in a roof tent, was very suitable at night and large. |
| mcafees-lookout | good | good | match | Bare dirt clearing in bush just off Mount Nebo Road, nobody close. | good: small. |
| scenic-drive-rest-area | good | good | match | Wide gravel pull-off on a bend, forest behind, vehicles already stopped there. | good: Lots of vans and campers here, an unofficial allowed spot. Can be loud and busy. |
| mt-coot-tha-reserve | good | good | match | Sealed lay-by off Sir Samuel Griffith Drive, in bushland with no homes nearby. | good: Very secluded and good spot. Can be loud motorbikes at night. |
| ford-road-car-park | good | good | match | Small sealed bush car park off Ford Road, no homes nearby. | good: Have stayed here in a roof tent, very secluded, good hikes, no toilet. |
| green-hill-reservoir | good | good | match | Sealed bay beside the reservoir pump house, surrounded by forest, with cars parked. | good: Pin should be slightly north in the car park, this is in the pedestrianised section. Pin moved about 50 m north-west onto the car park by eye from imagery; check it. |
| oxley-industrial-kerb | good | good | match | Park-side verge on Mabel Street where cars already park, homes 25 m across the road. | good: Quiet, no houses nearby, a truck was also parked there so I had no worries. |
| durack-kerb | good | good | match | Wide gravel verge off Bowhill Road beside paddocks, with tyre marks and no close homes. | good: Fairly busy road but suitable large kerb/off road parking. Near a nature reserve for a walk, and only industrial nearby. |
| yeronga-truck-parking | good | good | match | Large gravel car park off Brisbane Corso with no homes near and cars parked. | good: Permitted truck parking for overnight. Very suitable. |
| bardon-markets | good | good | match | Wide parking strip between bushland and a park; homes 70 m or more away. | good: I stay here frequently. Very good site. Only need to watch out for weekly events (The Bardon Markets) as you can't park far down the end. |
| bowman-park | good | good | match | Small sealed car park in Bowman Park, bush behind, homes 47 m or more away. | good: Acceptable, not very busy, a little small however the larger car park behind means it's never filled. |
| shailer-pioneer-park | maybe | good | near miss | Sealed park car park by courts and open parkland; homes over 60 m away. | maybe: A very quiet and secluded car park. The pin is in the wrong place, it should be over the car park. There are signs prohibiting staying but they aren't obvious and it's quiet enough you can get away with it. Pin moved onto the OSM car park (way 445265011). |
| minnippi-golf | maybe | good | near miss | Large golf-club car park backing onto bush; nearest homes about 80 m away. | maybe: Big enough that you can stay out of the way. Private site, so chance of a knock but I had no issues. |
| fletcher-pde | maybe | good | near miss | Gravel pull-off under trees by Ithaca Creek bush, homes about 35 m away. | maybe: Good, but very small. |
| new-farm-kerb | maybe | poor | near miss | Pin sits in a bushy gap between apartment blocks; no room for a van. | maybe: Good as a backup, but surrounded by residential. |
| coombabah-park | maybe | good | near miss | Shaded bush parking beside Shelter Road; cars already park here, no homes. | maybe: As noted I was kicked out, patrolled. |
| tinchi-tamba | maybe | good | near miss | Sealed reserve car park in bush by the river; no homes mapped. | maybe: Technically not allowed to stay overnight, but secluded enough that I didn't have an issue. |
| minnippi-bvd | poor | poor | match | Collector road between two roundabouts, no parked cars or parking lane. | poor: Not stayed overnight. |
| latimers-crossing-rd | poor | poor | match | Dirt apron at the mouth of a powerline easement track off the road. | poor: Gated. Not stayed overnight. |
| griffith-st | poor | poor (agent maybe: Dwelling 10 m from the best section) | match | Quiet riverside residential kerb; homes close on both sides. | poor: It's suitable for an overnight stay, the apartments are set back enough you wouldn't get in trouble. Just not super pleasant right next to a road. |

## Notes on this run (hand-written; `calibrate` regenerates the table above)

The set doesn't pass yet. Rubric v5 to v10 were each run on all 31 known places:

| Rubric | Failures (you → agent) |
|---|---|
| v5 (18 known places only) | mt-coot-tha-reserve, mcafees-lookout, pin07, durack-kerb good → maybe or poor; latimers-crossing-rd poor → maybe |
| v6 | pin05 good → poor, pin06 good → maybe, latimers-crossing-rd poor → good |
| v7 | mcafees-lookout good → maybe, minnippi-bvd poor → maybe |
| v8 | pin09 good → maybe |
| v9 | green-hill-reservoir good → maybe |
| v10 | pin09 good → maybe |

From v8 on, each run fails on a single borderline known place, and a different one each time: Sonnet's verdict there
changes from run to run (pin09 was good, maybe, good, maybe over v7–v10). pin09 is a sealed park lane off
Mabel St with homes 40 m or more away; the agent doubts there's room to pull off the lane. Your note calls it
a large kerb/off-road site, so the pin may sit on the lane rather than the verge you used. Moving the pin, or
your view of whether the lane is where you parked, would settle it. Rubric changes beyond v10 started to look like
tuning to single known places, so they stopped there.
