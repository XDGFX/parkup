// Batch helpers for the evaluation run. See src/evaluate/batch-prompt.md for how a Claude Code session uses them.
//
//   npm run evaluate -- queue [--force] [--json]           candidates without a current evaluation, tier order, by suburb
//   npm run evaluate -- prepare <candidate-id ...>        context for candidates from public/candidates.json
//   npm run evaluate -- prepare --calibration [spot-id ...] context for the calibration set
//   npm run evaluate -- check --model <id> <folder ...> | --calibration   validate agent.json, apply rule-outs, stamp, write evaluation.json
//   npm run evaluate -- calibrate                          compare the calibration set with the user's verdicts
import { readFile, writeFile } from "node:fs/promises";
import { HALF_WIDTH_M } from "../build/config.ts";
import type { Candidate } from "../build/build.ts";
import { evaluationQueue } from "../build/evaluations.ts";
import { EVALUATIONS } from "./store.ts";
import { calibrate, calibrationMarkdown } from "./calibrate.ts";
import { checkEvaluation, type Evaluation } from "./check.ts";
import type { Context } from "./context.ts";
import { fetchContext, spotTarget, type Spot, type Target } from "./fetch.ts";

export const CALIBRATION = "data/calibration";

const [command, ...args] = process.argv.slice(2);
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8"));

if (command === "queue") {
  // The dataset already carries each candidate's inherited evaluation, so rebuild it (npm run build:data) first.
  const { candidates } = await readJson<{ candidates: Candidate[] }>("public/candidates.json");
  const groups = evaluationQueue(candidates, { force: args.includes("--force") });
  if (args.includes("--json")) console.log(JSON.stringify(groups, null, 2));
  else {
    for (const g of groups) console.log(`tier ${g.tier ?? "none"} · ${g.suburb || "suburb unknown"}: ${g.ids.join(" ")}`);
    console.error(`${groups.reduce((n, g) => n + g.ids.length, 0)} candidates in ${groups.length} groups`);
  }
} else if (command === "prepare") {
  const calibration = args.includes("--calibration");
  const ids = args.filter((a) => !a.startsWith("--"));
  const targets: { target: () => Promise<Target>; dir: string }[] = [];
  if (calibration) {
    const spots = await readJson<Spot[]>(`${CALIBRATION}/spots.json`);
    for (const s of spots.filter((s) => !ids.length || ids.includes(s.id)))
      targets.push({ target: () => spotTarget(s, HALF_WIDTH_M), dir: `${CALIBRATION}/${s.id}` });
  } else {
    const { candidates } = await readJson<{ candidates: Candidate[] }>("public/candidates.json");
    for (const id of ids) {
      const c = candidates.find((c) => c.id === id);
      if (!c) throw new Error(`no candidate ${id}`);
      targets.push({
        // A kerb's line, a car park's outline, or an off-road site's single point.
        target: async () => ({
          id: c.id, street: c.street, suburb: c.suburb, line: c.line, osm_tags: {},
          kind: c.kind === "kerb" ? "kerb" : c.line.length > 1 ? "outline" : "point",
          ...(c.side ? { side: c.side } : {}),
        }),
        dir: `${EVALUATIONS}/${c.id}`,
      });
    }
  }
  // A few at a time: the QLD services and Overpass don't like being hammered.
  let failed = 0;
  for (let i = 0; i < targets.length; i += 4) {
    await Promise.all(targets.slice(i, i + 4).map(async ({ target, dir }) => {
      try {
        const ctx = await fetchContext(await target(), `${dir}/context.json`);
        const esri = ctx.chunks.every((c) => c.images.esri) ? "" : " (no Esri: QLD only)";
        console.log(`${ctx.id}: ${ctx.chunks.length} chunks, ${ctx.signs.length} signs, ${ctx.buildings.filter((b) => b.dwelling).length} dwellings, ` +
          `${ctx.gates.length} gates${ctx.gates.some((g) => g.on_only_access) ? " (gated)" : ""}${esri}`);
      } catch (e) {
        failed++;
        console.error(`${dir}: ${e}`);
      }
    }));
  }
  process.exitCode = failed ? 1 : 0;
} else if (command === "check") {
  const m = args.indexOf("--model");
  if (m < 0 || !args[m + 1]) throw new Error("check needs --model <model id>");
  const model = args[m + 1]!;
  const dirs = args.filter((a, i) => i !== m && i !== m + 1 && a !== "--calibration");
  if (args.includes("--calibration"))
    dirs.push(...(await readJson<Spot[]>(`${CALIBRATION}/spots.json`)).map((s) => `${CALIBRATION}/${s.id}`));
  // Stamped once, from the clock, as the batch post-processes; an evaluation already stamped keeps its time.
  const evaluatedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  let failed = 0;
  for (const dir of dirs) {
    let raw: unknown;
    try { raw = await readJson(`${dir}/agent.json`); } catch (e) { failed++; console.error(`${dir}: can't read agent.json: ${e}`); continue; }
    const context = await readJson<Context>(`${dir}/context.json`);
    const previous = await readJson<Evaluation>(`${dir}/evaluation.json`).catch(() => null);
    const res = checkEvaluation(raw, context, { model, evaluatedAt }, previous);
    if (!res.ok) { failed++; console.error(`${dir}: ${res.errors.join("; ")}`); continue; }
    await writeFile(`${dir}/evaluation.json`, JSON.stringify(res.evaluation, null, 2) + "\n");
    const e = res.evaluation;
    console.log(`${e.candidate}: ${e.verdict}${e.rule_outs.length ? ` (agent ${e.agent_verdict}; ${e.rule_outs.join("; ")})` : ""}`);
  }
  process.exitCode = failed ? 1 : 0;
} else if (command === "calibrate") {
  const spots = await readJson<Spot[]>(`${CALIBRATION}/spots.json`);
  const evaluations = new Map<string, Evaluation>();
  for (const s of spots) {
    try { evaluations.set(s.id, await readJson<Evaluation>(`${CALIBRATION}/${s.id}/evaluation.json`)); } catch { /* missing: reported */ }
  }
  const result = calibrate(spots, evaluations);
  await writeFile(`${CALIBRATION}/report.md`, calibrationMarkdown(result, spots, evaluations));
  console.log(`${result.passed ? "PASS" : "FAIL"}: ${result.exact} exact, ${result.nearMisses} near misses, ${result.failures.length} failures, ${result.missing.length} missing`);
  for (const f of result.failures) console.log(`  ${f.id}: you ${f.known}, agent ${f.verdict}`);
  process.exitCode = result.passed ? 0 : 1;
} else {
  console.error("usage: npm run evaluate -- queue|prepare|check|calibrate ...");
  process.exitCode = 2;
}
