// Batch helpers for the evaluation run. See src/evaluate/batch-prompt.md for how a Claude Code session uses them.
//
//   npm run evaluate -- prepare <candidate-id ...>        context for candidates from public/candidates.json
//   npm run evaluate -- prepare --calibration [spot-id ...] context for the calibration set
//   npm run evaluate -- check --model <id> <folder ...>   validate agent.json, apply rule-outs, stamp, write evaluation.json
//   npm run evaluate -- calibrate                          compare the calibration set with the user's verdicts
import { readFile, stat, writeFile } from "node:fs/promises";
import { HALF_WIDTH_M } from "../build/config.ts";
import type { Candidate } from "../build/build.ts";
import { calibrate, calibrationMarkdown } from "./calibrate.ts";
import { checkEvaluation, type Evaluation } from "./check.ts";
import type { Context } from "./context.ts";
import { fetchContext, spotTarget, type Spot, type Target } from "./fetch.ts";

export const CALIBRATION = "data/calibration";
export const EVALUATIONS = "data/evaluations";

const [command, ...args] = process.argv.slice(2);
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8"));

if (command === "prepare") {
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
        target: async () => ({ id: c.id, street: c.street, suburb: c.suburb, kind: "kerb", line: c.line, side: c.side, osm_tags: {} }),
        dir: `${EVALUATIONS}/${c.id}`,
      });
    }
  }
  // A few at a time: the QLD services and Overpass don't like being hammered.
  let failed = 0;
  for (let i = 0; i < targets.length; i += 3) {
    await Promise.all(targets.slice(i, i + 3).map(async ({ target, dir }) => {
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
  const dirs = args.filter((_, i) => i !== m && i !== m + 1);
  let failed = 0;
  for (const dir of dirs) {
    const agentFile = `${dir}/agent.json`;
    let raw: unknown;
    try { raw = await readJson(agentFile); } catch (e) { failed++; console.error(`${dir}: can't read agent.json: ${e}`); continue; }
    const context = await readJson<Context>(`${dir}/context.json`);
    // The agent wrote its file as soon as it finished, so the file's time is when it evaluated.
    const evaluatedAt = (await stat(agentFile)).mtime.toISOString().replace(/\.\d+Z$/, "Z");
    const res = checkEvaluation(raw, context, { model, evaluatedAt });
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
  console.error("usage: npm run evaluate -- prepare|check|calibrate ...");
  process.exitCode = 2;
}
