<!-- parkup evaluation rubric v5. Sent to each subagent with the batch prompt; bump the version on any change and re-run the calibration set. -->

You are evaluating one **candidate** for parkup: a place in or near Brisbane where someone might park a
light campervan (under 7.5 m) overnight and sleep in it. What they want most is **seclusion**: somewhere
nobody who would care is likely to notice. A cheap screen has already checked council parking signs
where there are any. Your job is what that screen can't see, judged from overhead imagery and elevation
data.

Read `context.json` in the candidate's folder, then look at every image it lists. Each chunk has two
images of the same box:

- `*-esri.jpg`: Esri World Imagery, about 30 cm per pixel. Recent; its capture date is in `esri_capture`.
- `*-qld.jpg`: Queensland aerial, 10 cm per pixel. Sharper but older; its dates are in `qld_capture`.

If Esri and QLD disagree, trust Esri for what's there now and QLD for fine detail. **Cyan dots** are
council parking signs (Brisbane City Council area only).

`context.json` → `kind` says what the candidate is:

- `kerb`: a kerb stretch. The **yellow line** is drawn about 5 m off the OSM road centreline, so it may sit
  slightly in the lane; the kerb is the nearest road edge on that side. The yellow ring marks its start,
  and distances are measured along the kerb from there. Chunks run in order, each `length_m` long.
- `off-street area`: the yellow line is the **outline** of an unsigned car park or gravel area.
- `point`: the yellow ring marks a pin someone dropped by hand. It's **approximate** and may land in a
  creek or on a hillside next to the real spot. Find the best place a van could stop within about
  100 m of the ring: a track, clearing, gravel area, car park or kerb. Look for parked vehicles and
  tyre tracks. Judge that place, and say what kind it is.

## Find the best section

Find the **best section**: the place within the candidate, at least one van length, that does best on
the drivers below. Judge the verdict on that section, not the average. If nowhere is usable, say so.

## Rule-outs

Any one of these makes the verdict `poor`, however secluded the place is:

- **No way in or nowhere to stop.** A light 2WD van can't reach the best section, or there's no room to
  pull fully out of the traffic lane. A visible gate or barrier across the only access counts.
  Off the road, the best evidence of a way in is **vehicles or tyre tracks** in the imagery. With
  neither, assume a vehicle can't get there, unless a formed track or gravel surface clearly reaches it.
- **A main road with no parking.** On a kerb: a through route or main road where no cars are parked
  along the kerb and there's no marked parking lane. A wide kerbside lane where other cars clearly
  park is fine.
- **A house right there.** `context.json` → `buildings` lists OSM buildings with their distance from the
  kerb or outline (`metres`) and where along it they sit (`at_m`). A house, apartment or other dwelling
  within about 10 m of the best section rules it out. Sheds, clubhouses, toilets and other
  non-residential buildings don't count. OSM misses some buildings, so check the imagery too.

## Grading

If nothing rules it out, grade the best section on **seclusion: who would care?**

- `good`: nobody close enough to care. The section backs onto bush, a park, field, car park, rail
  corridor or industry, and any dwellings are more than about 10 m away, typically across the road. On
  a kerb, other cars park there too, so a van won't stand out. Off-road sites and parking areas don't
  need other cars; nobody else being there is the point. A wide or 50 km/h road isn't a drawback if
  cars park along it.
- `maybe`: workable, with one real drawback: dwellings 10–25 m away on the section's own side, a kerb
  with no parking convention, through traffic at night, or exposure to a busy road.

## Flags

Surface these, but don't let them decide the verdict unless they're extreme.

- **Slope.** Use `context.json` → `slope`. Give the grade at the best section, and flag it as steep if
  it's over about 3%. Only rule a spot out on slope above about 12%. The DEM can't show crossfall.
- **Gate (not closed in imagery), low-lying or flood-prone ground** (`slope.min_elevation_m` under about
  5 m near a creek or river), **noise** (rail, venues, an arterial).
- **Signs vs imagery.** Painted markings or features that contradict or add to the signs. Don't restate
  the sign rules.

## Neutral facts

Report these as facts, never as good or bad:

- **Sun and shade:** what covers the best section and from which side. The morning sun comes from the
  east, the afternoon sun from the west and the midday sun from the north. Shade suits a hot night; sun
  suits solar.
- **Rubbish:** visible dumped rubbish. It signals that the place is secluded, so it doesn't count against
  it.

Write the summary and reasons for someone glancing at a phone: short, concrete, no hedging, British
English. Base every claim on something you saw in the images or the data. If you can't tell from overhead
(street lighting, crossfall, kerb height, signs on site), say so in `cannot_judge` rather than guessing.
