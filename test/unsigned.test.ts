// Unsigned kerbs, trims, cautions, the St Lucia Traffic Area, unreadable plates and frontage, through the build seam.
import { describe, expect, it } from "vitest";
import { build, UNREADABLE, type BuildInput, type Candidate } from "../src/build/build.ts";
import { outBy } from "../src/timetable/timetable.ts";
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

describe("soft cautions", () => {
  const BUS = /bus stop/i, CROSS = /crossing/i;
  // A short yellow line splits the west kerb at y = -85 to -87, so the buffer's direction shows.
  const split = [yellowLine(-4, -85, -4, -87)];
  const cautioned = (input: Partial<BuildInput>, re: RegExp, side: "west" | "east" = "west") =>
    onTest(run({ lines: split, ...input }).candidates, side).filter((c) => c.cautions.some((x) => re.test(x))).map(extent);

  it("an unsigned bus stop cautions 20 m before it and 10 m after it, in the direction of traffic", () => {
    // The west kerb carries northbound traffic, so the buffer runs from y = -120 to y = -90.
    const nodes = [node(800, -7, -100, { highway: "bus_stop" })];
    expect(cautioned({ nodes }, BUS)).toEqual([[-87, -186]]);
    expect(cautioned({ nodes }, BUS, "east")).toEqual([]);
    // Southbound on the east kerb: from y = -80 to y = -110.
    const east = [node(801, 7, -100, { highway: "bus_stop" })];
    expect(cautioned({ nodes: east, lines: [yellowLine(4, -113, 4, -115)] }, BUS, "east")).toEqual([[-14, -113]]);
  });

  it("a Bus Zone plate replaces the bus-stop buffer", () => {
    const nodes = [node(800, -7, -100, { highway: "bus_stop" })];
    expect(cautioned({ nodes, signs: westPair(-95, -105, "Bus Zone") }, BUS)).toEqual([]);
  });

  it("crossings caution both kerbs, and aren't trims", () => {
    const nodes = [node(802, 0, -150, { highway: "crossing" })];
    expect(cautioned({ nodes }, CROSS)).toEqual([[-87, -186]]);
    expect(cautioned({ nodes }, CROSS, "east")).toEqual([[-14, -186]]);
  });
});

describe("the St Lucia Traffic Area", () => {
  const areas = [area("ST LUCIA TRAFFIC AREA", -50, 10, 50, -210)];
  const at = (s: string) => new Date(`${s}+10:00`);

  it("gives unsigned kerbs inside it 2P 7am–6pm Mon–Fri, February to November only", () => {
    const [c] = onTest(run({ areas }).candidates);
    expect(c!.rules).toMatchObject([{ kind: "limit", limitHours: 2, days: [1, 2, 3, 4, 5], start: 7, end: 18, months: [2, 11] }]);
    expect(outBy(c!, at("2026-03-02T09:00"))?.at).toEqual(at("2026-03-02T11:00"));
    expect(outBy(c!, at("2026-12-07T09:00"))).toBeNull();
    expect(outBy(c!, at("2026-01-12T09:00"))).toBeNull();
    expect(c!.overnight).toBe(true);
  });

  it("doesn't apply outside the polygon, or where plates sign the kerb", () => {
    expect(onTest(run({ areas: [area("ST LUCIA TRAFFIC AREA", 500, 500, 600, 400)] }).candidates)[0]!.rules).toEqual([]);
    const signed = onTest(run({ areas, signs: westPair(-20, -80, NP, "MON-FRI:7am-9am") }).candidates).find((c) => c.plates.length && !/Traffic Area/.test(c.plates[0]!));
    expect(signed!.rules.map((r) => r.label)).toEqual(["No Parking MON-FRI:7am-9am"]);
  });
});

describe("unreadable plates, read strictly and leniently", () => {
  const signed = (cs: Candidate[]) => onTest(cs).filter((c) => c.plates.length);

  it("fails even leniently: dropped", () => {
    const signs = [...westPair(-20, -80, "No Stopping Any Time"), ...westPair(-20, -80, NP, "ALL OTHER TIMES:-")];
    const { candidates, report } = run({ signs });
    expect(signed(candidates)).toEqual([]);
    expect(report.unparsed).toEqual([{ text: `${NP}: ALL OTHER TIMES:-`, count: 2, dropped: 1, normal: 0, unreadable: 0 }]);
  });

  it("passes strictly: a normal candidate", () => {
    const { candidates, report } = run({ signs: westPair(-20, -80, "4P Parallel", "WHENEVER:sometimes") });
    expect(signed(candidates)).toMatchObject([{ rules: [{ kind: "limit", limitHours: 4, start: 0, end: 24 }] }]);
    expect(signed(candidates)[0]!.cautions).not.toContain(UNREADABLE);
    expect(report.unparsed[0]).toMatchObject({ normal: 1, dropped: 0, unreadable: 0 });
  });

  it("passes only leniently: a candidate with an unreadable-sign caution", () => {
    const { candidates, report } = run({ signs: westPair(-20, -80, NP, "ALL OTHER TIMES:-") });
    expect(signed(candidates)).toMatchObject([{ rules: [], cautions: [UNREADABLE], overnight: true }]);
    expect(report.unparsed[0]).toMatchObject({ unreadable: 1, dropped: 0, normal: 0 });
  });
});

describe("frontage", () => {
  const tiers = (input: Partial<BuildInput>, side: "west" | "east" = "west") => onTest(run(input).candidates, side).map((c) => [extent(c), c.tier, c.frontage?.zone]);

  it("probes across the road reserve for the zone, and splits the kerb where it changes", () => {
    const zones = [zone("OS1", -100, 0, -6, -100), zone("LDR", -100, -100, -6, -200)];
    expect(tiers({ zones })).toEqual([[[-14, -100], 1, "OS1"], [[-100, -186], 3, "LDR"]]);
  });

  it("assigns tiers from the spec's table", () => {
    const tierOf = (code: string) => tiers({ zones: [zone(code, -100, 0, -6, -200)] })[0]![1];
    expect(["OS2", "SR1", "EM", "SP3", "LII", "SC1"].map(tierOf)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(["MDR", "LMR2", "CF4"].map(tierOf)).toEqual([2, 2, 2]);
    expect(["LDR", "CR1", "CR2"].map(tierOf)).toEqual([3, 3, 3]);
  });

  it("orders candidates by tier, with no frontage last", () => {
    const zones = [zone("LDR", -100, 0, -6, -200), zone("OS1", 6, 0, 100, -200)];
    const { candidates } = run({ zones });
    expect(candidates.find((c) => c.street === "Test Street")).toMatchObject({ side: "east", tier: 1 });
    const order = candidates.map((c) => c.tier ?? 4);
    expect(order).toEqual([...order].sort());
    expect(candidates.at(-1)!.tier).toBeNull();
  });

  it("excludes kerbs facing CF5 Education purpose, and the report counts schools it covers", () => {
    const { candidates, report } = run({ zones: [zone("CF5", -100, 0, -6, -200)], nodes: [node(700, -50, -100, { amenity: "school" })] });
    expect(onTest(candidates)).toEqual([]);
    expect(report.excludedM.school).toBeGreaterThanOrEqual(170); // Test Street, and the side-road kerbs facing it
    expect(report.coverage.schools).toEqual({ mapped: 1, inExcludedZone: 1 });
  });

  it("excludes CF4 only where OSM maps a kindergarten or childcare centre in it", () => {
    const zones = [zone("CF4", -100, 0, -6, -200)];
    expect(tiers({ zones })).toEqual([[[-14, -186], 2, "CF4"]]);
    const { candidates, report } = run({ zones, nodes: [node(701, -50, -100, { amenity: "childcare" }), node(702, 50, -100, { amenity: "kindergarten" })] });
    expect(onTest(candidates)).toEqual([]);
    expect(report.excludedM.kindergarten).toBeGreaterThanOrEqual(170);
    expect(report.coverage.kindergartens).toEqual({ mapped: 2, inExcludedZone: 1 });
  });
});
