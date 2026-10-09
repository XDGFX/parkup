// Unsigned kerbs, trims, cautions, the St Lucia Traffic Area, unreadable plates and frontage, through the build seam.
import { describe, expect, it } from "vitest";
import { build, type BuildInput, type Candidate } from "../src/build/build.ts";
import type { OsmWay } from "../src/build/inputs.ts";
import { area, node, sign, testStreet, way, westPair, yellowLine, zone } from "./fixtures.ts";

const R = 6371008.8, RAD = Math.PI / 180;
const yOf = ([, lat]: [number, number]) => (lat + 27.5) * R * RAD;
/** The candidate's extent along Test Street, as [north y, south y], rounded to the metre. */
const extent = (c: Candidate) => {
  const ys = [yOf(c.line[0]!), yOf(c.line.at(-1)!)].map(Math.round);
  return [Math.max(...ys), Math.min(...ys)];
};
const run = (input: Partial<BuildInput>) => build({ signs: [], ways: testStreet, ...input });
const onTest = (cs: Candidate[], side: "west" | "east" = "west") => cs.filter((c) => c.street === "Test Street" && c.side === side);
/** Test Street's candidates on one side, as extents from north to south. */
const kerb = (input: Partial<BuildInput>, side: "west" | "east" = "west") => onTest(run(input).candidates, side).map(extent).sort((a, b) => b[0]! - a[0]!);

describe("unsigned kerbs", () => {
  it("run from intersection to intersection, set back 10 m from the kerb of the crossing road (s 170)", () => {
    // Top Road and Bottom Road are residential, so their kerbs are 4 m from the centreline.
    const west = onTest(run({}).candidates);
    expect(west.map(extent)).toEqual([[-14, -186]]);
    expect(west[0]).toMatchObject({ rules: [], plates: [], overnight: true, daytime: true, lowConfidence: false });
  });

  it("are set back 20 m where the intersection has traffic lights", () => {
    expect(kerb({ nodes: [node(900, 0, -195, { highway: "traffic_signals" })] })).toEqual([[-14, -176]]);
  });

  it("aren't set back along the continuous side of a T-intersection without lights", () => {
    // Top Road's north kerb faces away from Test Street, so it runs right through the T.
    const { candidates } = run({});
    const lengths = (side: string) => candidates.filter((c) => c.street === "Top Road" && c.side === side).map((c) => Math.round(c.lengthM));
    expect(lengths("north")).toEqual([100, 100]);
    expect(lengths("south")).toEqual([86, 86]);
  });

  it("are left off motorways and slip roads", () => {
    const ways = [way(5, "Fast Way", [50, 51], [[0, 0], [0, -200]], "motorway"), way(6, "Slip", [60, 61], [[50, 0], [50, -200]], "primary_link")];
    expect(run({ ways }).candidates).toEqual([]);
  });
});

const NP = "No Parking Specified Times";
/** Test Street with extra OSM tags on its centreline, optionally drawn south to north. */
const tagged = (tags: Record<string, string>, reversed = false): OsmWay[] => {
  const w = reversed ? way(1, "Test Street", [2, 1], [[0, -200], [0, 0]]) : way(1, "Test Street", [1, 2], [[0, 0], [0, -200]]);
  return [{ ...w, tags: { ...w.tags, ...tags } }, ...testStreet.slice(1)];
};

describe("hard trims", () => {
  it("yellow no-stopping lines cut the kerb they're painted on", () => {
    expect(kerb({ lines: [yellowLine(-4, -50, -4, -70)] })).toEqual([[-14, -50], [-70, -186]]);
    expect(kerb({ lines: [yellowLine(-4, -50, -4, -70)] }, "east")).toEqual([[-14, -186]]);
  });

  it("yellow lines cut signed stretches too", () => {
    const signed = onTest(run({ signs: westPair(-20, -120, "2P Parallel", "MON-FRI:7am-6pm"), lines: [yellowLine(-4, -60, -4, -70)] }).candidates)
      .filter((c) => c.plates.length);
    expect(signed.map(extent)).toEqual([[-20, -60], [-70, -120]]);
  });

  it("an unpaired arrow stops at a yellow line", () => {
    const { candidates } = run({ signs: [sign({ x: -4, y: -40, dir: "Left", type: NP, times: "MON-FRI:7am-6pm" })], lines: [yellowLine(-4, -100, -4, -110)] });
    const west = onTest(candidates);
    expect(west.filter((c) => c.lowConfidence).map(extent)).toEqual([[-40, -100]]);
    expect(west.filter((c) => !c.plates.length).map(extent).sort()).toEqual([[-110, -186], [-14, -40]].sort());
  });

  it("OSM parking:*=no removes the kerb on that side of the way, and the report counts the length", () => {
    const { candidates, report } = run({ ways: tagged({ "parking:right": "no" }) });
    expect(onTest(candidates).map(extent)).toEqual([]);
    expect(onTest(candidates, "east").map(extent)).toEqual([[-14, -186]]);
    expect(report.parkingNoM).toBeCloseTo(172, -1);
  });

  it("reads parking:left and parking:right along the way as it's drawn", () => {
    // Drawn south to north, the way's left is the west kerb.
    expect(kerb({ ways: tagged({ "parking:left": "no" }, true) })).toEqual([]);
    expect(kerb({ ways: tagged({ "parking:left": "no" }, true) }, "east")).toEqual([[-14, -186]]);
  });

  it("paired plates override OSM parking:*=no", () => {
    const { candidates } = run({ signs: westPair(-20, -120, "2P Parallel", "MON-FRI:7am-6pm"), ways: tagged({ "parking:both": "no" }) });
    expect(onTest(candidates).map(extent)).toEqual([[-20, -120]]);
  });

  it("drops whatever is left under 8 m", () => {
    const { report, candidates } = run({ lines: [yellowLine(-4, -50, -4, -70), yellowLine(-4, -76, -4, -90)] });
    expect(onTest(candidates).map(extent).sort()).toEqual([[-14, -50], [-90, -186]].sort());
    expect(report.short).toBeGreaterThanOrEqual(1);
  });
});
