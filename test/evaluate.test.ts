// Batch post-processing: an agent's raw evaluation plus the candidate's context in, a checked and stamped evaluation out.
import { describe, expect, it } from "vitest";
import { checkEvaluation, type Stamp } from "../src/evaluate/check.ts";
import type { Context } from "../src/evaluate/context.ts";
import { lonLat } from "./fixtures.ts";

/** A square house outline, `size` metres a side, with its south-west corner at (x, y). */
const house = (x: number, y: number, size = 10) =>
  [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]].map(([a, b]) => lonLat(a!, b!));

/**
 * A 100 m kerb on the west side of a north–south street at x = -4, drawn north (y = 0) to south (y = -100).
 * A detached house stands 6 m west of the kerb between 70 m and 80 m along it; a shed sits right on the kerb at 10 m.
 */
const kerb = (over: Partial<Context> = {}): Context => ({
  id: "test-kerb",
  street: "Test Street",
  suburb: "Taringa",
  kind: "kerb",
  line: [lonLat(-4, 0), lonLat(-4, -100)],
  length_m: 100,
  osm_tags: {},
  signs: [],
  buildings: [
    { building: "detached", name: null, dwelling: true, metres: 6, at_m: 70, outline: house(-20, -80) },
    { building: "shed", name: null, dwelling: false, metres: 1, at_m: 10, outline: house(-15, -15, 10) },
  ],
  gates: [],
  slope: { step_m: 5, samples: [], min_elevation_m: 30, max_elevation_m: 32, mean_grade_pct: 1, max_grade_pct: 2 },
  chunks: [{
    chunk: 1, from_m: 0, to_m: 100, length_m: 100,
    images: { esri: ".cache/imagery/test-kerb/chunk1-esri.jpg", qld: ".cache/imagery/test-kerb/chunk1-qld.jpg" },
    esri_capture: { date: "2025-09-24", resolution_m: 0.31, sensor: "Vantor WV03" },
    qld_capture: { dataset: "Brisbane_LGA_2022_10cm_SISP", start: "2022-07-24", end: "2022-09-12", resolution_m: 0.1 },
    ground_size_m: [66, 160], image_px: [440, 1067],
  }],
  ...over,
});

const agentSays = (over: Record<string, unknown> = {}) => ({
  verdict: "good",
  kind: "kerb stretch",
  summary: "Quiet kerb beside the park, cars already park here.",
  reasons: ["Backs onto parkland", "Cars park along here"],
  best_section: { from_m: 60, to_m: 90, where: "opposite the park gate", slope_pct: 1 },
  drivers: { seclusion: "Park behind", access_and_room: "Wide kerb", traffic: "Quiet", convention: "Cars park here" },
  flags: [],
  sun_shade: "Shaded from the west by gums",
  rubbish: "none seen",
  cannot_judge: ["Street lighting"],
  confidence: "medium",
  ...over,
});

const stamp: Stamp = { model: "claude-sonnet-4-6", evaluatedAt: "2026-10-09T10:00:00+10:00" };

describe("schema validation", () => {
  it("rejects output that doesn't match the schema, naming what's wrong", () => {
    const { verdict: _, ...noVerdict } = agentSays();
    const res = checkEvaluation({ ...noVerdict, colour: "green" }, kerb(), stamp);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.join("\n")).toMatch(/verdict/);
    expect(res.errors.join("\n")).toMatch(/colour/);
  });

  it("rejects a verdict outside good, maybe and poor", () => {
    const res = checkEvaluation(agentSays({ verdict: "great" }), kerb(), stamp);
    expect(res.ok).toBe(false);
  });

  it("accepts output that matches the schema", () => {
    const res = checkEvaluation(agentSays({ best_section: { from_m: 0, to_m: 30, where: "north end", slope_pct: 1 } }), kerb(), stamp);
    expect(res.ok).toBe(true);
  });
});

const checked = (raw: unknown, ctx: Context = kerb()) => {
  const res = checkEvaluation(raw, ctx, stamp);
  if (!res.ok) throw new Error(res.errors.join("\n"));
  return res.evaluation;
};

describe("code rule-outs", () => {
  it("a dwelling within about 10 m of the best section turns an agent's good into poor", () => {
    const e = checked(agentSays());
    expect(e.verdict).toBe("poor");
    expect(e.agent_verdict).toBe("good");
    expect(e.rule_outs).toEqual([expect.stringMatching(/dwelling.*\b6 m\b/i)]);
    expect(e.facts.nearest_dwelling_m).toBe(6);
  });

  it("leaves good alone when the nearest dwelling is further from the best section", () => {
    const e = checked(agentSays({ best_section: { from_m: 0, to_m: 30, where: "north end", slope_pct: 1 } }));
    expect(e.verdict).toBe("good");
    expect(e.rule_outs).toEqual([]);
    // The house's nearest corner is 40 m south of the section's end and 6 m west of the kerb.
    expect(e.facts.nearest_dwelling_m).toBeCloseTo(Math.hypot(40, 6), 0);
  });

  it("ignores sheds and other buildings nobody lives in", () => {
    const e = checked(agentSays({ best_section: { from_m: 0, to_m: 20, where: "north end", slope_pct: 1 } }));
    expect(e.verdict).toBe("good");
  });

  it("a mapped gate on the only access turns good into poor", () => {
    const [lon, lat] = lonLat(-30, -50);
    const ctx = kerb({ buildings: [], gates: [{ barrier: "gate", locked: null, lon, lat, metres: 26, on_only_access: true }] });
    const e = checked(agentSays({ verdict: "maybe" }), ctx);
    expect(e.verdict).toBe("poor");
    expect(e.agent_verdict).toBe("maybe");
    expect(e.rule_outs).toEqual([expect.stringMatching(/gate/i)]);
  });

  it("a gate that isn't on the only access is a fact, not a rule-out", () => {
    const [lon, lat] = lonLat(-30, -50);
    const ctx = kerb({ buildings: [], gates: [{ barrier: "gate", locked: null, lon, lat, metres: 26, on_only_access: false }] });
    expect(checked(agentSays(), ctx).verdict).toBe("good");
  });
});

describe("stamping", () => {
  it("stamps the imagery dates, the evaluation time, the model and the rubric version", () => {
    const ctx = kerb({ chunks: [kerb().chunks[0]!, { ...kerb().chunks[0]!, chunk: 2, esri_capture: { date: "2024-06-01", resolution_m: 0.3, sensor: "x" } }] });
    const e = checked(agentSays(), ctx);
    expect(e.imagery).toEqual({ esri: ["2024-06-01", "2025-09-24"], qld: "2022-07" });
    expect(e.evaluated_at).toBe("2026-10-09T10:00:00+10:00");
    expect(e.model).toBe("claude-sonnet-4-6");
    expect(e.rubric).toMatch(/^v\d+$/);
  });

  it("never restamps an evaluation already stamped from the same agent output", () => {
    const first = checked(agentSays(), kerb());
    const again = checkEvaluation(agentSays(), kerb(), { ...stamp, evaluatedAt: "2026-10-20T09:00:00+10:00" }, first);
    expect(again.ok && again.evaluation.evaluated_at).toBe("2026-10-09T10:00:00+10:00");
  });

  it("stamps a new agent output afresh, even over an earlier evaluation", () => {
    const first = checked(agentSays(), kerb());
    const redone = checkEvaluation(agentSays({ verdict: "maybe" }), kerb(), { ...stamp, evaluatedAt: "2026-10-20T09:00:00+10:00" }, first);
    expect(redone.ok && redone.evaluation.evaluated_at).toBe("2026-10-20T09:00:00+10:00");
  });

  it("resolves a kerb's best section to lon/lat points at each end", () => {
    const e = checked(agentSays({ best_section: { from_m: 0, to_m: 30, where: "north end", slope_pct: 1 } }));
    expect(e.best_section!.points).toHaveLength(2);
    const [a, b] = e.best_section!.points;
    expect(a![0]).toBeCloseTo(lonLat(-4, 0)[0], 5);
    expect(a![1]).toBeCloseTo(lonLat(-4, 0)[1], 5);
    expect(b![1]).toBeCloseTo(lonLat(-4, -30)[1], 5);
  });

  it("resolves a point candidate's best section to the point", () => {
    const ctx = kerb({ kind: "point", line: [lonLat(10, 10)], length_m: 0, buildings: [] });
    const e = checked(agentSays({ kind: "parking area", best_section: { from_m: null, to_m: null, where: "car park", slope_pct: 2 } }), ctx);
    expect(e.best_section!.points).toHaveLength(1);
    expect(e.best_section!.points[0]![1]).toBeCloseTo(lonLat(10, 10)[1], 5);
  });

  it("measures slope and low-lying ground at the best section from the DEM", () => {
    // A 0.2 m rise per 5 m step over the north 30 m (4%), flat south of that, all under 5 m above sea level.
    const samples = Array.from({ length: 21 }, (_, i) => {
      const [lon, lat] = lonLat(-4, -5 * i);
      return { lon, lat, at_m: 5 * i, line: 0, elevation_m: i <= 6 ? 2 + 0.2 * i : 3.2 };
    });
    const ctx = kerb({ buildings: [], slope: { step_m: 5, samples, min_elevation_m: 2, max_elevation_m: 3.2, mean_grade_pct: 1, max_grade_pct: 4 } });
    const steep = checked(agentSays({ best_section: { from_m: 0, to_m: 30, where: "north end", slope_pct: 1 } }), ctx);
    expect(steep.facts.slope_pct).toBeCloseTo(4, 1);
    expect(steep.facts.low_lying).toBe(true);
    const flat = checked(agentSays({ best_section: { from_m: 50, to_m: 100, where: "south end", slope_pct: 1 } }), ctx);
    expect(flat.facts.slope_pct).toBe(0);
    expect(checked(agentSays()).facts.low_lying).toBe(false);
  });

  it("keeps a null best section when the agent finds nowhere usable", () => {
    const e = checked(agentSays({ verdict: "poor", best_section: null }));
    expect(e.best_section).toBeNull();
  });
});
