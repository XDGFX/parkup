// The calibration check: the calibration set's evaluations against the user's own verdicts.
// Every good and poor call of the user's must match. A known place the user calls maybe may come back anything: a near miss.
// Every known place must have been judged under the same, current rubric version. A batch runs only once this passes.
import { readFile } from "node:fs/promises";
import type { Evaluation, Verdict } from "./check.ts";
import { RUBRIC_VERSION } from "./config.ts";
import type { KnownPlace } from "./fetch.ts";

export const CALIBRATION = "data/calibration";
export const PLACES = `${CALIBRATION}/places.json`;

type Known = Pick<KnownPlace, "id" | "known">;

export type Calibration = {
  passed: boolean;
  /** The rubric version every known place must have been judged under. */
  rubric: string;
  exact: number;
  nearMisses: number;
  failures: { id: string; known: Verdict; verdict: Verdict }[];
  missing: string[];
  /** Known places whose evaluation was made under another rubric version. */
  staleRubric: string[];
};

/** The user's verdict, from the start of the known place's `known` note. */
export const knownVerdict = (known: string): Verdict => {
  const m = /^(good|maybe|poor)\b/.exec(known);
  if (!m) throw new Error(`no verdict in "${known}"`);
  return m[1] as Verdict;
};

export function calibrate(places: Known[], evaluations: Map<string, Evaluation>, rubric = RUBRIC_VERSION): Calibration {
  const r: Calibration = { passed: false, rubric, exact: 0, nearMisses: 0, failures: [], missing: [], staleRubric: [] };
  for (const s of places) {
    const e = evaluations.get(s.id), known = knownVerdict(s.known);
    if (!e) { r.missing.push(s.id); continue; }
    if (e.rubric !== rubric) r.staleRubric.push(s.id);
    if (e.verdict === known) r.exact++;
    else if (known === "maybe") r.nearMisses++;
    else r.failures.push({ id: s.id, known, verdict: e.verdict });
  }
  r.passed = !r.failures.length && !r.missing.length && !r.staleRubric.length;
  return r;
}

/** The committed calibration set: the known places and whichever evaluations they have, checked against the current rubric. */
export async function loadCalibration() {
  const places = JSON.parse(await readFile(PLACES, "utf8")) as KnownPlace[];
  const evaluations = new Map<string, Evaluation>();
  for (const s of places) {
    try { evaluations.set(s.id, JSON.parse(await readFile(`${CALIBRATION}/${s.id}/evaluation.json`, "utf8"))); } catch { /* missing: reported */ }
  }
  return { places, evaluations, result: calibrate(places, evaluations) };
}

/** One line for the console: pass or fail, and the counts. */
export const calibrationSummary = (r: Calibration) =>
  `${r.passed ? "PASS" : "FAIL"} on rubric ${r.rubric}: ${r.exact} exact, ${r.nearMisses} near misses, ${r.failures.length} failures, ` +
  `${r.missing.length} missing, ${r.staleRubric.length} judged under another rubric`;

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function calibrationMarkdown(r: Calibration, places: Known[], evaluations: Map<string, Evaluation>): string {
  const any = [...evaluations.values()][0];
  const rows = places.map((s) => {
    const e = evaluations.get(s.id), known = knownVerdict(s.known);
    if (!e) return `| ${s.id} | ${known} | — | missing | | |`;
    const result = e.rubric !== r.rubric ? `stale (rubric ${e.rubric})` : e.verdict === known ? "match" : known === "maybe" ? "near miss" : "**FAIL**";
    const agent = e.agent_verdict !== e.verdict ? `${e.verdict} (agent ${e.agent_verdict}: ${e.rule_outs.join("; ")})` : e.verdict;
    return `| ${s.id} | ${known} | ${esc(agent)} | ${result} | ${esc(e.summary)} | ${esc(s.known)} |`;
  });
  return `# Calibration report

${r.passed ? "**PASS**" : "**FAIL**"}: ${r.exact} of ${places.length} match, ${r.nearMisses} near miss${r.nearMisses === 1 ? "" : "es"} involving maybe, ` +
`${r.failures.length} failure${r.failures.length === 1 ? "" : "s"}, ${r.missing.length} missing, ${r.staleRubric.length} judged under another rubric.

Rule: every good and poor call of the user's must match; a known place the user calls maybe may come back good or poor.
Every known place must have been judged under the current rubric (${r.rubric}).
${any ? `Rubric ${any.rubric}, model ${any.model}, run ${[...evaluations.values()].map((e) => e.evaluated_at).sort()[0]?.slice(0, 10)}.` : ""}
Each known place's context and evaluation are in \`data/calibration/<place>/\`. Imagery is in the gitignored cache;
\`npm run evaluate -- prepare --calibration\` refetches it.

| Known place | You | Agent | Result | Agent's summary | Your note |
|---|---|---|---|---|---|
${rows.join("\n")}
`;
}
