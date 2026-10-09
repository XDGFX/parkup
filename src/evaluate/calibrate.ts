// The calibration check: the calibration set's evaluations against the user's own verdicts.
// Every good and poor call of the user's must match. A spot the user calls maybe may come back anything: a near miss.
import type { Evaluation, Verdict } from "./check.ts";

type KnownSpot = { id: string; street: string; suburb: string; known: string };

export type Calibration = {
  passed: boolean;
  exact: number;
  nearMisses: number;
  failures: { id: string; known: Verdict; verdict: Verdict }[];
  missing: string[];
};

/** The user's verdict, from the start of the spot's `known` note. */
export const knownVerdict = (known: string): Verdict => {
  const m = /^(good|maybe|poor)\b/.exec(known);
  if (!m) throw new Error(`no verdict in "${known}"`);
  return m[1] as Verdict;
};

export function calibrate(spots: KnownSpot[], evaluations: Map<string, Evaluation>): Calibration {
  const r: Calibration = { passed: false, exact: 0, nearMisses: 0, failures: [], missing: [] };
  for (const s of spots) {
    const e = evaluations.get(s.id), known = knownVerdict(s.known);
    if (!e) { r.missing.push(s.id); continue; }
    if (e.verdict === known) r.exact++;
    else if (known === "maybe") r.nearMisses++;
    else r.failures.push({ id: s.id, known, verdict: e.verdict });
  }
  r.passed = !r.failures.length && !r.missing.length;
  return r;
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function calibrationMarkdown(r: Calibration, spots: KnownSpot[], evaluations: Map<string, Evaluation>): string {
  const any = [...evaluations.values()][0];
  const rows = spots.map((s) => {
    const e = evaluations.get(s.id), known = knownVerdict(s.known);
    if (!e) return `| ${s.id} | ${known} | — | missing | | |`;
    const result = e.verdict === known ? "match" : known === "maybe" ? "near miss" : "**FAIL**";
    const agent = e.agent_verdict !== e.verdict ? `${e.verdict} (agent ${e.agent_verdict}: ${e.rule_outs.join("; ")})` : e.verdict;
    return `| ${s.id} | ${known} | ${esc(agent)} | ${result} | ${esc(e.summary)} | ${esc(s.known)} |`;
  });
  return `# Calibration report

${r.passed ? "**PASS**" : "**FAIL**"}: ${r.exact} of ${spots.length} match, ${r.nearMisses} near miss${r.nearMisses === 1 ? "" : "es"} involving maybe, ` +
`${r.failures.length} failure${r.failures.length === 1 ? "" : "s"}, ${r.missing.length} missing.

Rule: every good and poor call of the user's must match; a spot the user calls maybe may come back good or poor.
${any ? `Rubric ${any.rubric}, model ${any.model}, run ${[...evaluations.values()].map((e) => e.evaluated_at).sort()[0]?.slice(0, 10)}.` : ""}
Each spot's context and evaluation are in \`data/calibration/<spot>/\`. Imagery is in the gitignored cache;
\`npm run evaluate -- prepare --calibration\` refetches it.

| Spot | You | Agent | Result | Agent's summary | Your note |
|---|---|---|---|---|---|
${rows.join("\n")}
`;
}
