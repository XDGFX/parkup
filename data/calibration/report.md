# Calibration report

**PASS**: 24 of 31 match, 7 near misses involving maybe, 0 failures, 0 missing, 0 judged under another rubric.

Rule: every good and poor call of the user's must match; a known place the user calls maybe may come back good or poor.
Every known place must have been judged under the current rubric (v11).
Rubric v11, model claude-sonnet-5-5, run 2026-10-09.
Each known place's context and evaluation are in `data/calibration/<place>/`. Imagery is in the gitignored cache;
`npm run evaluate -- prepare --calibration` refetches it.

| Known place | You | Agent | Result | Agent's summary | Your note |
|---|---|---|---|---|---|
| heroes-ave | poor | poor | match | Through road with no parking and no cars along the park-side kerb. | poor: main road with no clear parking. Would need a much wider kerb and other cars parking there. |
| keith-st | maybe | good | near miss | Unlimited-parking kerb beside bowls club and car park, with cars already parked. | maybe throughout (revised in the 2026-10 review, was good on the lower section). |
| adsett-st | poor | poor | match | Short residential kerb with houses 4-6 m from it. | poor: too close to houses to be useful. |
| marmion-pde | good | good | match | Kerb along an open park, with homes only across the road. | good at chunk 3 only. Steep there, which is worth flagging but isn't a dealbreaker. |
| garden-car-park | good | good | match | Open gravel car park beside a community garden, parkland and playing fields. | good: unsigned, checked in person. The gravel area north of Heroes Ave was the gold standard until a sign went up a couple of weeks ago. Review: decent, small and can be busy in the day. |
| pin03 | good | good | match | Gravel bushland car park just east of the pin, full of parked cars. | good: I stay here often, very secluded. Road can be loud. Weekends get very busy with hikers. |
| pin05 | good | good | match | Pin is in the creek; sealed and gravel boat-launch parking about 60 m north-east. | good: Stayed in a roof tent, had no issues. |
| pin06 | good | good | match | Highway rest area with a loop road, shelters and caravans already parked. | good: Allowed free campground with toilets. |
| pin07 | good | good | match | Open gravel and dirt clearing beside Boundary Road, backing onto empty paddock. | good: I've stayed a few times. Anywhere else it's questionable; you shouldn't just drive off the road into a field without an obvious track. But here it's sandwiched between industrial zones and an airport, so I doubt anyone cares. I never had an issue. |
| pin08 | good | good | match | Gravel car park at the edge of a sports oval, no homes close. | good: Can be busy when football training is in the morning. |
| pin09 | good | good | match | Dead-end park access road beside an oval, shaded, homes 60 m or more off. | good: Large kerb/off road site far from houses. Good spot. Checked on site (2026-10): the pull-off on the north side of the lane is about as wide as the lane itself, and the south side has roughly a lane's width of room before a fence on both sides, so there is room to pull off. The houses about 40–60 m away across the park feel far away; I hadn't noticed them. No gates; it's a through road. |
| pin10 | good | good | match | Large free sealed car park beside the rail line; homes 60 m or more away. | good: Have stayed here in a roof tent, was very suitable at night and large. |
| mcafees-lookout | good | good | match | Small dirt pull-off in forest just off Mount Nebo Road, no homes near. | good: small. |
| scenic-drive-rest-area | good | good | match | Wide gravel rest area on a bend, bush behind, cars already parked. | good: Lots of vans and campers here, an unofficial allowed spot. Can be loud and busy. |
| mt-coot-tha-reserve | good | good | match | Sealed lay-by loop off Sir Samuel Griffith Drive, in forest, no buildings near. | good: Very secluded and good spot. Can be loud motorbikes at night. |
| ford-road-car-park | good | good | match | Small sealed trailhead car park in forest off Ford Road, no homes near. | good: Have stayed here in a roof tent, very secluded, good hikes, no toilet. |
| green-hill-reservoir | good | good | match | Sealed bush-edged parking apron beside a small utility building, no homes nearby. | good: Pin should be slightly north in the car park, this is in the pedestrianised section. Pin moved about 50 m north-west onto the car park by eye from imagery; check it. |
| oxley-industrial-kerb | good | good | match | Dirt verge beside a park on Mabel Street; homes are across the road. | good: Quiet, no houses nearby, a truck was also parked there so I had no worries. |
| durack-kerb | good | good | match | Wide gravel verge beside Bowhill Road, paddocks behind, no homes close. | good: Fairly busy road but suitable large kerb/off road parking. Near a nature reserve for a walk, and only industrial nearby. |
| yeronga-truck-parking | good | good | match | Large gravel car park off Brisbane Corso with many cars, no homes nearby. | good: Permitted truck parking for overnight. Very suitable. |
| bardon-markets | good | good | match | Wide lane lined with parked cars and vans, bush behind, homes far off. | good: I stay here frequently. Very good site. Only need to watch out for weekly events (The Bardon Markets) as you can't park far down the end. |
| bowman-park | good | good | match | Small sealed park car park by the toilets, wooded, homes over 45 m away. | good: Acceptable, not very busy, a little small however the larger car park behind means it's never filled. |
| shailer-pioneer-park | maybe | good | near miss | Sealed sports-court car park in open parkland, homes well over 100 m away. | maybe: A very quiet and secluded car park. The pin is in the wrong place, it should be over the car park. There are signs prohibiting staying but they aren't obvious and it's quiet enough you can get away with it. Pin moved onto the OSM car park (way 445265011). |
| minnippi-golf | maybe | good | near miss | Large sealed golf club car park, bush behind, nearest homes about 80 m off. | maybe: Big enough that you can stay out of the way. Private site, so chance of a knock but I had no issues. |
| fletcher-pde | maybe | good | near miss | Sandy pull-off off Fletcher Parade backing onto dense creek bush, with cars already parked. | maybe: Good, but very small. |
| new-farm-kerb | maybe | poor | near miss | Short lane end squeezed between apartment blocks; dwellings within 15 m. | maybe: Good as a backup, but surrounded by residential. |
| coombabah-park | maybe | good | near miss | Roadside parking beside Shelter Road in bushland, with cars already parked and no homes. | maybe: As noted I was kicked out, patrolled. |
| tinchi-tamba | maybe | good | near miss | Bushland car park in a wetlands reserve with picnic area and no homes nearby. | maybe: Technically not allowed to stay overnight, but secluded enough that I didn't have an issue. |
| minnippi-bvd | poor | poor | match | Collector road between two roundabouts with no parked cars and no parking lane. | poor: Not stayed overnight. |
| latimers-crossing-rd | poor | poor | match | Dirt apron at the mouth of a powerline easement track off a rural road. | poor: Gated. Not stayed overnight. |
| griffith-st | poor | poor | match | Narrow riverside street with houses and apartments right on the kerb. | poor: It's suitable for an overnight stay, the apartments are set back enough you wouldn't get in trouble. Just not super pleasant right next to a road. |

## Notes on this run (hand-written; `calibrate` regenerates the table above)

The set passes on rubric v11. Rubric v5 to v11 were each run on all 31 known places:

| Rubric | Failures (you → agent) |
|---|---|
| v5 (18 known places only) | mt-coot-tha-reserve, mcafees-lookout, pin07, durack-kerb good → maybe or poor; latimers-crossing-rd poor → maybe |
| v6 | pin05 good → poor, pin06 good → maybe, latimers-crossing-rd poor → good |
| v7 | mcafees-lookout good → maybe, minnippi-bvd poor → maybe |
| v8 | pin09 good → maybe |
| v9 | green-hill-reservoir good → maybe |
| v10 | pin09 good → maybe |
| v11 | none (pass: 24 exact, 7 near misses) |

From v8 to v10, each run failed on a single borderline known place, and a different one each time: Sonnet's
verdict on pin09 changed from run to run (good, maybe, good, maybe over v7–v10), and under v10 it doubted
there was room to pull off the lane and called the park open to view from homes 40–60 m away.

You then checked pin09 on site: the pull-off on one side of the lane is about as wide as the lane, the other side
has about a lane's width before a fence, the homes across the park feel far away, and there are no gates on what
is a through road. That's recorded in its `known` note (which never reaches the agents). v11 adds general
guidance those observations support, without naming any place:

- room to stop is judged by the clear ground beside a lane, so a shoulder or pull-off about as wide as the lane is
  room to pull fully off;
- homes 40 m or more away across open parkland don't on their own make a place exposed or `maybe`;
- mapped gates with a way round, or on side paths off a through road, don't put access in doubt.

Under v11 Sonnet called pin09 good, though its reasons describe the lane as a dead-end park access road, which
your note contradicts; the verdict rests on the homes being about 60 m away and the quiet lane. Given how pin09's
verdict swung between runs, one pass doesn't prove it's settled; watch it on the next re-run.
