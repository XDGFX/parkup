// Post-processing for one agent evaluation: validate it against the schema, compute the measurable facts at the
// agent's best section, apply the code rule-outs, resolve the best section to lon/lat points and stamp it.
import { Ajv } from "ajv";
import schema from "./schema.json" with { type: "json" };
import { dist, length, project, slice, toLonLat, toXY, type LonLat, type XY } from "../build/geo.ts";
import { LOW_LYING_M, RUBRIC_VERSION, RULE_OUT } from "./config.ts";
import type { Context } from "./context.ts";

export type Verdict = "good" | "maybe" | "poor";

/** The agent's output, as the schema describes it. */
export type AgentEvaluation = {
  verdict: Verdict;
  kind: "kerb stretch" | "parking area" | "off-road site";
  summary: string;
  reasons: string[];
  best_section: { from_m: number | null; to_m: number | null; where: string; slope_pct: number } | null;
  drivers: { seclusion: string; access_and_room: string; traffic: string; convention: string };
  flags: string[];
  sun_shade: string;
  rubbish: string;
  cannot_judge: string[];
  confidence: "low" | "medium" | "high";
};

export type Stamp = { model: string; evaluatedAt: string };

/** Measured by code at the best section, so they don't depend on the agent's eye. */
export type Facts = {
  /** The nearest OSM dwelling to the best section, in metres; null when none is mapped nearby. */
  nearest_dwelling_m: number | null;
  /** A mapped gate or barrier sits on the only access. */
  gated: boolean;
  /** Mean DEM grade along the best section (or through a point), in percent. */
  slope_pct: number | null;
  min_elevation_m: number | null;
  /** The best section sits under LOW_LYING_M above sea level. */
  low_lying: boolean;
};

export type Evaluation = Omit<AgentEvaluation, "verdict" | "best_section"> & {
  candidate: string;
  /** The agent's best section, resolved to lon/lat: two points along a kerb or outline, one for a point. */
  best_section: (NonNullable<AgentEvaluation["best_section"]> & { points: LonLat[] }) | null;
  imagery: { esri: string[]; qld: string | null };
  evaluated_at: string;
  model: string;
  rubric: string;
  verdict: Verdict;
  /** The agent's own verdict, before the code rule-outs. */
  agent_verdict: Verdict;
  /** Code rule-outs that applied; any one makes the verdict poor. */
  rule_outs: string[];
  facts: Facts;
};

export type CheckResult = { ok: true; evaluation: Evaluation } | { ok: false; errors: string[] };

const validate = new Ajv({ allErrors: true }).compile<AgentEvaluation>(schema);

export function checkEvaluation(raw: unknown, context: Context, stamp: Stamp): CheckResult {
  if (!validate(raw)) {
    return {
      ok: false,
      errors: (validate.errors ?? []).map((e) =>
        `${e.instancePath || "/"} ${e.message}${e.params && "additionalProperty" in e.params ? `: ${e.params.additionalProperty}` : ""}`),
    };
  }
  const { section, from, to } = bestSection(context, raw.best_section);
  const facts = measure(context, section, from, to);
  const ruleOuts: string[] = [];
  if (facts.nearest_dwelling_m !== null && facts.nearest_dwelling_m <= RULE_OUT.DWELLING_M)
    ruleOuts.push(`Dwelling ${facts.nearest_dwelling_m} m from the best section`);
  if (facts.gated) ruleOuts.push("Mapped gate on the only access");
  const { verdict, best_section, ...rest } = raw;
  const esri = [...new Set(context.chunks.flatMap((c) => c.esri_capture ? [c.esri_capture.date] : []))].sort();
  return {
    ok: true,
    evaluation: {
      candidate: context.id,
      verdict: ruleOuts.length ? "poor" : verdict,
      agent_verdict: verdict,
      rule_outs: ruleOuts,
      ...rest,
      best_section: best_section && { ...best_section, points: section.map(toLonLat) },
      facts,
      imagery: { esri, qld: context.chunks[0]?.qld_capture.start.slice(0, 7) ?? null },
      evaluated_at: stamp.evaluatedAt,
      model: stamp.model,
      rubric: RUBRIC_VERSION,
    },
  };
}

/** The best section as a line in metres (a slice of the kerb or outline, or the candidate's point) and its extent along the line. */
function bestSection(context: Context, best: AgentEvaluation["best_section"]): { section: XY[]; from: number; to: number } {
  const line = context.line.map(toXY);
  if (context.kind === "point" || line.length < 2) return { section: [line[0]!], from: -Infinity, to: Infinity };
  const total = length(line);
  const clamp = (v: number | null | undefined, d: number) => Math.max(0, Math.min(total, v ?? d));
  let from = clamp(best?.from_m, 0), to = clamp(best?.to_m, total);
  if (from > to) [from, to] = [to, from];
  const part = slice(line, from, to);
  return { section: part.length ? part : [line[0]!], from, to };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function measure(context: Context, section: XY[], from: number, to: number): Facts {
  const dwellings = context.buildings.filter((b) => b.dwelling);
  const nearest = dwellings.length
    ? Math.round(Math.min(...dwellings.map((b) => distance(b.outline.map(toXY), section))))
    : null;
  // DEM samples within the section; for a short section, the samples either side of it too.
  const step = context.slope.step_m;
  const near = context.slope.samples.filter((s) => s.at_m >= from - (to - from < step ? step : 0) && s.at_m <= to + (to - from < step ? step : 0));
  const grades: number[] = [];
  for (let i = 1; i < near.length; i++) {
    const a = near[i - 1]!, b = near[i]!;
    if (a.line === b.line && a.elevation_m !== null && b.elevation_m !== null && b.at_m > a.at_m)
      grades.push(Math.abs(b.elevation_m - a.elevation_m) / (b.at_m - a.at_m) * 100);
  }
  const elevations = near.flatMap((s) => s.elevation_m === null ? [] : [s.elevation_m]);
  const minElevation = elevations.length ? Math.min(...elevations) : null;
  return {
    nearest_dwelling_m: nearest,
    gated: context.gates.some((g) => g.on_only_access),
    slope_pct: grades.length ? round1(grades.reduce((a, b) => a + b, 0) / grades.length) : null,
    min_elevation_m: minElevation === null ? null : round1(minElevation),
    low_lying: minElevation !== null && minElevation < LOW_LYING_M,
  };
}

/** Shortest distance between two polylines (a single point counts as a line). */
function distance(a: XY[], b: XY[]): number {
  const toLine = (p: XY, line: XY[]) => line.length < 2 ? dist(p, line[0]!) : Math.abs(project(line, p).offset);
  return Math.min(...a.map((p) => toLine(p, b)), ...b.map((p) => toLine(p, a)));
}
