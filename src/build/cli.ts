// One command from snapshot to candidates dataset and build report.
// Run: npm run build:data (add --snapshot to take a fresh snapshot first).
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build, type BuildReport } from "./build.ts";

if (process.argv.includes("--snapshot")) execFileSync("npx", ["tsx", "src/build/snapshot.ts"], { stdio: "inherit" });

const signs = JSON.parse(await readFile("data/snapshot/signs.json", "utf8"));
const osm = JSON.parse(await readFile("data/snapshot/osm.json", "utf8"));
const toiletSnapshot = JSON.parse(await readFile("data/snapshot/toilets.json", "utf8"));
const { candidates, toilets, report } = build({ signs: signs.signs, ways: osm.ways, toilets: toiletSnapshot.toilets });

await mkdir("public", { recursive: true });
await writeFile("public/toilets.json", JSON.stringify({
  builtFrom: { toilets: toiletSnapshot.takenAt },
  licence: "National Public Toilet Map, via Brisbane City Council open data (CC BY 4.0).",
  toilets,
}));
await writeFile("public/candidates.json", JSON.stringify({
  builtFrom: { signs: signs.takenAt, osm: osm.takenAt },
  licence: "Derived from OpenStreetMap (ODbL) and Brisbane City Council open data (CC BY 4.0).",
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
| Signed stretches | ${r.stretches} |
| Dropped: shorter than 8 m | ${r.short} |
| Dropped: fail both the overnight and daytime tests | ${r.failsScreen} |
| Candidates | ${r.candidates} |
| … low confidence (unpaired arrow) | ${r.lowConfidence} |
| … day only | ${r.dayOnly} |

## Unparsed plate text

Read strictly (the rule always applies).

| Plates | Text |
|---|---|
${r.unparsed.map((u) => `| ${u.count} | \`${u.text}\` |`).join("\n")}
`;
}
