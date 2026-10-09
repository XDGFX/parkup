// The evaluation store and carry-over: matches committed evaluations to rebuilt candidates by geometry, and decides
// what still needs evaluating. Signs play no part, so a sign change re-runs the screen and keeps the evaluation.
import type { Evaluation } from "../evaluate/check.ts";
import { CARRY_OVER, QUEUE_GROUP } from "./config.ts";
import { dist, inRings, length, pointAt, project, toXY, type Compass, type LonLat, type XY } from "./geo.ts";

/** A committed evaluation with the geometry of the candidate it judged, as the batch saw it. */
export type PriorEvaluation = {
  /** The id of the candidate it judged, which a rebuild may have renumbered. */
  candidate: string;
  /** kerb: a kerb line. outline: a parking area's boundary. point: a single point. */
  kind: "kerb" | "outline" | "point";
  line: LonLat[];
  /** The compass side of a kerb. */
  side: string | null;
  evaluation: Evaluation;
};

/** The rubric and imagery the batch uses now. An evaluation made with anything older is due again. */
export type CurrentEvaluation = {
  rubric: string;
  /** The oldest capture date (YYYY-MM-DD or YYYY-MM) still counted as current, per provider. */
  imagery: { esri: string; qld: string };
};

/** What the dataset carries of an evaluation: what the card shows and where the pin goes. */
export type CandidateEvaluation = Pick<Evaluation, "verdict" | "summary" | "reasons" | "flags" | "sun_shade" | "rubbish" | "rule_outs" | "imagery" | "evaluated_at" | "model" | "rubric"> & {
  /** Where to park, with its lon/lat points: two along a kerb or outline, one for a point. */
  best_section: { where: string; points: LonLat[] } | null;
  /** The id of the candidate it was made for, when it carried over from an earlier build. */
  from: string;
  /** Made with the current rubric and imagery. One that isn't is still shown, and queued again. */
  current: boolean;
};

type Target = { id: string; kind: "kerb" | "parking-area" | "off-road"; side: Compass | null; line: LonLat[] };

/** The evaluation `c` inherits, if any: the closest geometric match, then the newest. */
export function inherit(c: Target, priors: PriorEvaluation[], current: CurrentEvaluation): CandidateEvaluation | null {
  let best: { prior: PriorEvaluation; score: number } | null = null;
  for (const prior of priors) {
    const score = match(c, prior);
    if (score === null) continue;
    if (!best || score > best.score || (score === best.score && prior.evaluation.evaluated_at > best.prior.evaluation.evaluated_at))
      best = { prior, score };
  }
  if (!best) return null;
  const e = best.prior.evaluation;
  return {
    verdict: e.verdict, summary: e.summary, reasons: e.reasons.slice(0, 3), flags: e.flags, sun_shade: e.sun_shade, rubbish: e.rubbish,
    rule_outs: e.rule_outs, imagery: e.imagery, evaluated_at: e.evaluated_at, model: e.model, rubric: e.rubric,
    best_section: e.best_section && { where: e.best_section.where, points: ends(e.best_section.points) },
    from: best.prior.candidate,
    current: isCurrent(e, current),
  };
}

/** One subagent's share of a batch: candidates of one tier in one suburb. */
export type QueueGroup = { tier: 1 | 2 | 3 | null; suburb: string; ids: string[] };

/**
 * The candidates still to evaluate, in tier order, grouped by suburb into groups of up to `size`. Candidates with a
 * current evaluation are skipped, so re-running after a stop carries on; `force` queues them all.
 */
export function evaluationQueue(
  candidates: { id: string; tier: 1 | 2 | 3 | null; suburb: string; evaluation: { current: boolean } | null }[],
  { force = false, size = QUEUE_GROUP }: { force?: boolean; size?: number } = {},
): QueueGroup[] {
  const due = candidates.filter((c) => force || !c.evaluation?.current);
  const tiers = [1, 2, 3, null] as const;
  const groups: QueueGroup[] = [];
  for (const tier of tiers) {
    const bySuburb = new Map<string, string[]>();
    for (const c of due.filter((c) => c.tier === tier)) bySuburb.set(c.suburb, [...(bySuburb.get(c.suburb) ?? []), c.id]);
    for (const [suburb, ids] of bySuburb)
      for (let i = 0; i < ids.length; i += size) groups.push({ tier, suburb, ids: ids.slice(i, i + size) });
  }
  return groups;
}

/** Two points for a section along a line (its ends), one for a point. */
const ends = (points: LonLat[]): LonLat[] => (points.length > 1 ? [points[0]!, points.at(-1)!] : points);

function isCurrent(e: Evaluation, current: CurrentEvaluation): boolean {
  if (e.rubric !== current.rubric) return false;
  if (e.imagery.qld !== null && e.imagery.qld < current.imagery.qld) return false;
  const newestEsri = e.imagery.esri.at(-1);
  return newestEsri === undefined || newestEsri >= current.imagery.esri;
}

/** How well a prior evaluation's geometry matches the candidate, higher is better; null when it doesn't. */
function match(c: Target, prior: PriorEvaluation): number | null {
  if (c.kind === "kerb") {
    if (prior.kind !== "kerb" || prior.side !== c.side) return null;
    const share = kerbOverlap(c.line.map(toXY), prior.line.map(toXY));
    return share >= CARRY_OVER.KERB_OVERLAP ? share : null;
  }
  if (prior.kind === "kerb") return null;
  if (prior.candidate === c.id) return 2;
  const a = c.line.map(toXY), b = prior.line.map(toXY);
  if (a.length > 3 && b.length > 3) {
    const share = outlineOverlap(a, b);
    return share >= CARRY_OVER.OUTLINE_OVERLAP ? share : null;
  }
  const d = dist(centre(a), centre(b));
  return d <= CARRY_OVER.POINT_M ? 1 - d / CARRY_OVER.POINT_M / 2 : null;
}

/** The share of the longer line that lies within KERB_M of the other, sampled every metre. */
function kerbOverlap(a: XY[], b: XY[]): number {
  const within = (line: XY[], other: XY[]) => {
    const len = length(line), n = Math.max(1, Math.round(len));
    let near = 0;
    for (let i = 0; i <= n; i++) if (Math.abs(project(other, pointAt(line, (i / n) * len).p).offset) <= CARRY_OVER.KERB_M) near++;
    return near / (n + 1);
  };
  return Math.min(within(a, b), within(b, a));
}

/** Overlapping area as a share of the larger outline, sampled on a grid. */
function outlineOverlap(a: XY[], b: XY[]): number {
  const xs = [...a, ...b].map((p) => p[0]), ys = [...a, ...b].map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const step = Math.max(0.5, Math.max(x1 - x0, y1 - y0) / 100);
  let inA = 0, inB = 0, both = 0;
  for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) {
    const pa = inRings([a], [x, y]), pb = inRings([b], [x, y]);
    if (pa) inA++;
    if (pb) inB++;
    if (pa && pb) both++;
  }
  return both / Math.max(inA, inB, 1);
}

const centre = (pts: XY[]): XY => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
