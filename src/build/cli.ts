// One command from snapshot to candidates dataset and build report.
// Run: npm run build:data (add --snapshot to take a fresh snapshot first).
// Folds the committed evaluations in data/evaluations/ into the dataset, carried over by geometric match.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadEvaluations } from "../evaluate/store.ts";
import { build, type BuildReport } from "./build.ts";

if (process.argv.includes("--snapshot")) execFileSync("npx", ["tsx", "src/build/snapshot.ts"], { stdio: "inherit" });

const read = async (name: string) => JSON.parse(await readFile(`data/snapshot/${name}.json`, "utf8"));
const [signs, osm, lines, areas, zones, toiletSnapshot, sites, tenure] = await Promise.all(["signs", "osm", "lines", "areas", "zones", "toilets", "sites", "tenure"].map(read));
const { candidates, toilets, report } = build({
  signs: signs.signs, ways: osm.ways, nodes: [...(osm.nodes ?? []), ...sites.barriers], lines: lines.lines, areas: areas.areas, zones: zones.zones,
  toilets: toiletSnapshot.toilets,
  parkings: sites.parkings, minorWays: sites.minorWays, trails: sites.trails, qldTracks: sites.qldTracks, councilLand: sites.councilLand,
  parcels: tenure.parcels,
  evaluations: await loadEvaluations(),
});

await mkdir("public", { recursive: true });
await writeFile("public/toilets.json", JSON.stringify({
  builtFrom: { toilets: toiletSnapshot.takenAt },
  licence: "National Public Toilet Map, via Brisbane City Council open data (CC BY 4.0).",
  toilets,
}));
await writeFile("public/candidates.json", JSON.stringify({
  builtFrom: { signs: signs.takenAt, osm: osm.takenAt, lines: lines.takenAt, areas: areas.takenAt, zones: zones.takenAt, sites: sites.takenAt, tenure: tenure.takenAt },
  licence: "Derived from OpenStreetMap (ODbL), Brisbane City Council open data (CC BY 4.0) and State of Queensland data (CC BY 4.0).",
  candidates,
}));
await writeFile("data/build-report.json", JSON.stringify(report, null, 2) + "\n");
await writeFile("data/build-report.md", markdown(report, signs.takenAt));
console.log(`${report.candidates} candidates from ${report.stretches} stretches; orientation ${report.orientation.chosen} ` +
  `(carriageway ${report.orientation.carriageway}, footpath ${report.orientation.footpath}); ${report.unparsed.length} unparsed strings`);

function markdown(r: BuildReport, takenAt: string): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `# Build report

Snapshot taken ${takenAt}.

## Orientation

Share of ${r.orientation.arrows} arrow plates that pair cleanly with an opposite arrow on the same kerb:

| Reading | Clean-pairing share |
|---|---|
| Arrow read from the carriageway | ${pct(r.orientation.carriageway)} |
| Arrow read from the footpath | ${pct(r.orientation.footpath)} |

Chosen: **${r.orientation.chosen}**. The winner needs at least 60% and a 20-point lead (\`ORIENTATION\` in \`src/build/config.ts\`).

## Plates

| | Count |
|---|---|
| Plates in the snapshot | ${r.plates} |
| Area plates (traffic area boundaries, end of clearway) | ${r.areaPlates} |
| … of which metered parking areas, not yet applied | ${r.paidAreaPlates} |
| Not near a centreline | ${r.unsnapped} |
| No arrow, on the plate or its post | ${r.unarrowed} |
| Repeaters outside any paired stretch | ${r.orphanRepeaters} |

## Stretches

| | Count |
|---|---|
| Kerb stretches after trims | ${r.stretches} |
| … unsigned | ${r.unsigned} |
| Dropped: shorter than 8 m | ${r.short} |
| Dropped: fail both the overnight and daytime tests | ${r.failsScreen} |
| Candidates | ${r.candidates} |
| … low confidence (unpaired arrow) | ${r.lowConfidence} |
| … day only | ${r.dayOnly} |

## Trims and exclusions

| | Metres of kerb |
|---|---|
| Removed: OSM \`parking:*=no\` | ${r.parkingNoM} |
| Excluded: faces CF5 Education purpose | ${r.excludedM.school} |
| Excluded: faces CF4 Community purpose with a kindergarten or childcare centre | ${r.excludedM.kindergarten} |
| No frontage found within the probe | ${r.noFrontageM} |

## School and kindergarten coverage

How many schools and kindergartens mapped in OSM fall in a zone the build excludes. Any outside one aren't excluded.

| | Mapped in OSM | In an excluded zone |
|---|---|---|
| Schools | ${r.coverage.schools.mapped} | ${r.coverage.schools.inExcludedZone} |
| Kindergartens and childcare | ${r.coverage.kindergartens.mapped} | ${r.coverage.kindergartens.inExcludedZone} |

## Frontage tiers

| Tier | Candidates |
|---|---|
| 1 | ${r.byTier[1]} |
| 2 | ${r.byTier[2]} |
| 3 | ${r.byTier[3]} |
| No frontage | ${r.byTier.none} |

## Sites

| | Count |
|---|---|
| Parking areas | ${r.sites.parkingAreas} |
| Off-road sites | ${r.sites.offRoad} |
| … with any timetable data (plates inside, \`opening_hours\`, \`maxstay\`, \`fee:conditional\`) | ${r.sites.withTimetable} |
| Dropped: fail both the overnight and daytime tests | ${r.sites.failsScreen} |

Sites without timetable data count as open at all times, with an "hours unknown" caution.
OSM doesn't map clearings, so off-road sites at the dead ends of the track network stand in for them: a clearing
along a track that isn't at a dead end won't appear.

## Evaluations

| | Candidates |
|---|---|
| With an evaluation (from \`data/evaluations/\`) | ${r.evaluations.evaluated} |
| … current (this rubric, current imagery) | ${r.evaluations.current} |
| … carried over from an earlier build's candidate | ${r.evaluations.carriedOver} |
| Queued for evaluation (\`npm run evaluate -- queue\`) | ${r.evaluations.queued} |

## Unparsed plate text

Each stretch is screened reading the plate strictly (the rule always applies) and leniently (it never applies).
Fails leniently: dropped. Passes strictly: a normal candidate. Passes only leniently: a candidate with an "unreadable sign" caution.
A row of zeros means the plate governs no stretch: it was unpaired, trimmed away or left under 8 m.

| Plates | Text | Stretches dropped | Normal | Unreadable-sign caution |
|---|---|---|---|---|
${r.unparsed.map((u) => `| ${u.count} | \`${u.text}\` | ${u.dropped} | ${u.normal} | ${u.unreadable} |`).join("\n")}
`;
}
