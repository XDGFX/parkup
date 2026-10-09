// Evaluation carry-over and the re-evaluation queue, through the build seam: a rebuild with existing evaluations
// in, each candidate's inherited evaluation and the queue out.
import { describe, expect, it } from "vitest";
import { build, type BuildInput, type Candidate } from "../src/build/build.ts";
import { evaluationQueue, type PriorEvaluation } from "../src/build/evaluations.ts";
import type { Evaluation, Verdict } from "../src/evaluate/check.ts";
import type { OsmArea, SignRecord, TrailLine } from "../src/build/inputs.ts";
import { eastPair, lonLat, testStreet, westPair, zone } from "./fixtures.ts";

const R = 6371008.8, RAD = Math.PI / 180, KX = R * RAD * Math.cos(-27.5 * RAD), KY = R * RAD;
type LL = [number, number];
/** A line moved `dx` metres east and `dy` metres north. */
const shift = (line: LL[], dx: number, dy = 0): LL[] => line.map(([lon, lat]) => [lon + dx / KX, lat + dy / KY]);

const RUBRIC = "v10";
const IMAGERY = { esri: "2024-01-01", qld: "2022-07" };
const run = (input: Partial<BuildInput>) => build({ signs: [], ways: testStreet, current: { rubric: RUBRIC, imagery: IMAGERY }, ...input });
const kerbs = (input: Partial<BuildInput>) => run(input).candidates.filter((c) => c.kind === "kerb" && c.plates.length);

function evaluation(candidate: string, verdict: Verdict, over: Partial<Evaluation> = {}): Evaluation {
  return {
    candidate, verdict, agent_verdict: verdict, rule_outs: [], kind: "kerb stretch",
    summary: "Quiet park edge with cars already parked", reasons: ["Faces a park", "Cars park here", "Little traffic"],
    best_section: { from_m: 10, to_m: 30, where: "Opposite the bowls club", slope_pct: 2, points: [lonLat(-4, -30), lonLat(-4, -50)] },
    drivers: { seclusion: "high", access_and_room: "easy", traffic: "light", convention: "cars park here" },
    flags: ["Slope 4%"], sun_shade: "Shade from figs in the afternoon", rubbish: "None seen", cannot_judge: [], confidence: "high",
    facts: { nearest_dwelling_m: 40, gated: false, slope_pct: 2, min_elevation_m: 20, low_lying: false },
    imagery: { esri: ["2025-09-24"], qld: "2022-07" }, evaluated_at: "2026-10-09T09:00:00Z", model: "claude-sonnet-5-5", rubric: RUBRIC,
    ...over,
  };
}

/** An evaluation of `c` as it was, with its geometry moved by `dx` metres east. */
const priorFor = (c: Candidate, verdict: Verdict, dx = 0, over: Partial<Evaluation> = {}): PriorEvaluation => ({
  candidate: c.id, kind: "kerb", side: c.side, line: shift(c.line, dx), evaluation: evaluation(c.id, verdict, over),
});

const NP = "No Parking Specified Times";
const signs = westPair(-20, -120, NP, "MON-FRI:7am-6pm");

describe("kerb stretch carry-over", () => {
  it("a stretch whose kerb shifted by 2 m inherits the evaluation, and it's current", () => {
    const [before] = kerbs({ signs });
    const [after] = kerbs({ signs, evaluations: [priorFor(before!, "good", 2)] });
    expect(after!.evaluation).toMatchObject({ verdict: "good", current: true, summary: "Quiet park edge with cars already parked" });
  });

  it("a kerb shifted by 5 m is a different kerb: no evaluation", () => {
    const [before] = kerbs({ signs });
    expect(kerbs({ signs, evaluations: [priorFor(before!, "good", 5)] })[0]!.evaluation).toBeNull();
  });

  it("an evaluation of the other side of the street doesn't carry over", () => {
    const [before] = kerbs({ signs });
    expect(kerbs({ signs, evaluations: [{ ...priorFor(before!, "good"), side: "east" }] })[0]!.evaluation).toBeNull();
  });

  it("changed plates over the same kerb keep the evaluation, and it stays current", () => {
    const [before] = kerbs({ signs });
    const changed = westPair(-20, -120, NP, "MON-SAT:7am-7pm");
    const [after] = kerbs({ signs: changed, evaluations: [priorFor(before!, "maybe")] });
    expect(after!.plates).toEqual(["No Parking MON-SAT:7am-7pm"]);
    expect(after!.evaluation).toMatchObject({ verdict: "maybe", current: true, from: before!.id });
  });

  it("signs that move an end by 5 m of 100 still overlap 90%: inherited", () => {
    const [before] = kerbs({ signs });
    const [after] = kerbs({ signs: westPair(-20, -125, NP, "MON-FRI:7am-6pm"), evaluations: [priorFor(before!, "good")] });
    expect(after!.evaluation?.verdict).toBe("good");
  });

  it("signs that cut the stretch to 70 m of 100 don't: it's a new stretch with no evaluation", () => {
    const [before] = kerbs({ signs });
    const after = kerbs({ signs: westPair(-20, -90, NP, "MON-FRI:7am-6pm"), evaluations: [priorFor(before!, "good")] });
    expect(after.map((c) => c.evaluation)).toEqual([null]);
  });

  it("an evaluation from an older rubric is still shown, but isn't current", () => {
    const [before] = kerbs({ signs });
    const [after] = kerbs({ signs, evaluations: [priorFor(before!, "good", 0, { rubric: "v9" })] });
    expect(after!.evaluation).toMatchObject({ verdict: "good", rubric: "v9", current: false });
  });

  it("an evaluation on imagery older than the current imagery isn't current", () => {
    const [before] = kerbs({ signs });
    const oldEsri = kerbs({ signs, evaluations: [priorFor(before!, "good", 0, { imagery: { esri: ["2023-05-01"], qld: "2022-07" } })] });
    const oldQld = kerbs({ signs, evaluations: [priorFor(before!, "good", 0, { imagery: { esri: ["2025-09-24"], qld: "2019-06" } })] });
    expect([oldEsri[0]!.evaluation?.current, oldQld[0]!.evaluation?.current]).toEqual([false, false]);
  });

  it("carries the card's fields and the best section's end points into the dataset", () => {
    const [before] = kerbs({ signs });
    const [after] = kerbs({ signs, evaluations: [priorFor(before!, "good")] });
    expect(after!.evaluation).toEqual({
      verdict: "good", summary: "Quiet park edge with cars already parked", reasons: ["Faces a park", "Cars park here", "Little traffic"],
      flags: ["Slope 4%"], sun_shade: "Shade from figs in the afternoon", rubbish: "None seen", rule_outs: [],
      imagery: { esri: ["2025-09-24"], qld: "2022-07" }, evaluated_at: "2026-10-09T09:00:00Z", model: "claude-sonnet-5-5", rubric: "v10",
      best_section: { where: "Opposite the bowls club", points: [lonLat(-4, -30), lonLat(-4, -50)] },
      from: before!.id, current: true,
    });
  });
});

describe("the evaluation queue", () => {
  // West kerb faces a park (tier 1), east kerb houses (tier 3). The southern plates are in St Lucia.
  const stLucia = (s: SignRecord[]) => s.map((x) => ({ ...x, suburb: "ST LUCIA" }));
  const queueInput: Partial<BuildInput> = {
    signs: [...westPair(-10, -60, NP, "MON-FRI:7am-6pm"), ...stLucia(westPair(-120, -190, NP, "MON-FRI:7am-6pm")), ...eastPair(-10, -60, NP, "MON-FRI:7am-6pm")],
    zones: [zone("OS2", -100, 10, -6, -210), zone("LDR", 6, 10, 100, -210)],
  };
  const where = (candidates: Candidate[]) => (id: string) => candidates.find((c) => c.id === id)!;

  it("lists every unevaluated candidate once, in tier order, in groups of one suburb", () => {
    const { candidates } = run(queueInput);
    const groups = evaluationQueue(candidates, { size: 2 });
    const of = where(candidates);
    expect(groups.flatMap((g) => g.ids).sort()).toEqual(candidates.map((c) => c.id).sort());
    // Tier 1 first and no frontage (the cross streets' outer kerbs) last; within a tier, each suburb's groups run together.
    const runs = groups.map((g) => `${g.tier} ${g.suburb}`).filter((k, i, all) => k !== all[i - 1]);
    expect(runs).toEqual(["1 St Lucia", "1 Taringa", "3 St Lucia", "3 Taringa", "null St Lucia", "null Taringa"]);
    for (const g of groups) {
      expect(g.ids.length).toBeLessThanOrEqual(2);
      expect(g.ids.every((id) => of(id).suburb === g.suburb && of(id).tier === g.tier)).toBe(true);
    }
  });

  it("skips candidates with a current evaluation, queues stale ones, and --force queues everything", () => {
    const { candidates } = run(queueInput);
    const [a, b] = candidates.filter((c) => c.plates.length);
    const evaluations = [priorFor(a!, "good"), priorFor(b!, "good", 0, { rubric: "v9" })];
    const rebuilt = run({ ...queueInput, evaluations }).candidates;
    const queued = evaluationQueue(rebuilt).flatMap((g) => g.ids);
    expect(queued).not.toContain(a!.id);
    expect(queued).toContain(b!.id);
    expect(queued).toHaveLength(candidates.length - 1);
    expect(evaluationQueue(rebuilt, { force: true }).flatMap((g) => g.ids)).toHaveLength(candidates.length);
  });
});

describe("site carry-over", () => {
  const ring = (x0: number, y0: number, x1: number, y1: number) => [lonLat(x0, y0), lonLat(x1, y0), lonLat(x1, y1), lonLat(x0, y1), lonLat(x0, y0)];
  /** An OSM car park east of Test Street, 40 m square. */
  const carPark = (id: number, dx = 0): OsmArea => ({ type: "way", id, tags: { amenity: "parking", access: "yes" }, rings: [ring(20 + dx, -50, 60 + dx, -90)] });
  const outlinePrior = (candidate: string, dx: number): PriorEvaluation =>
    ({ candidate, kind: "outline", side: null, line: ring(20 + dx, -50, 60 + dx, -90), evaluation: evaluation(candidate, "good") });
  /** A BCC access road south of Bottom Road, whose site is 20 m in at (-50, -225). */
  const trail = (id: string): TrailLine => ({ id, itemType: "ACCESS ROAD", park: "Test Park", description: null, coords: [lonLat(-50, -205), lonLat(-50, -300)] });
  const pointPrior = (candidate: string, dy: number): PriorEvaluation =>
    ({ candidate, kind: "point", side: null, line: [lonLat(-50, -225 + dy)], evaluation: evaluation(candidate, "maybe") });
  const site = (input: Partial<BuildInput>) => run(input).candidates.find((c) => c.kind !== "kerb")!;

  it("a car park inherits by its OSM id, even if its outline was redrawn", () => {
    expect(site({ parkings: [carPark(500)], evaluations: [outlinePrior("osm-way-500", 30)] }).evaluation?.verdict).toBe("good");
  });

  it("an outline overlapping by at least 80% inherits under a new id; one overlapping less doesn't", () => {
    // Moved 5 m: 35 of 40 m overlap, 87.5%. Moved 10 m: 75%.
    expect(site({ parkings: [carPark(501)], evaluations: [outlinePrior("osm-way-500", 5)] }).evaluation?.from).toBe("osm-way-500");
    expect(site({ parkings: [carPark(501)], evaluations: [outlinePrior("osm-way-500", 10)] }).evaluation).toBeNull();
  });

  it("a point within 20 m inherits; one further away doesn't", () => {
    expect(site({ trails: [trail("2")], evaluations: [pointPrior("bcc-trail-1", 15)] }).evaluation?.verdict).toBe("maybe");
    expect(site({ trails: [trail("2")], evaluations: [pointPrior("bcc-trail-1", 25)] }).evaluation).toBeNull();
  });

  it("a site with a new rubric version keeps its evaluation, not current", () => {
    const prior = { ...outlinePrior("osm-way-500", 0), evaluation: evaluation("osm-way-500", "poor", { rubric: "v9" }) };
    expect(site({ parkings: [carPark(500)], evaluations: [prior] }).evaluation).toMatchObject({ verdict: "poor", current: false });
  });

  it("a kerb evaluation never carries over to a site", () => {
    const prior = { ...outlinePrior("osm-way-500", 0), kind: "kerb" as const };
    expect(site({ parkings: [carPark(500)], evaluations: [prior] }).evaluation).toBeNull();
  });
});
