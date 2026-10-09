// The committed evaluations: one folder per evaluated candidate under data/evaluations/, holding the context the
// batch gathered (with the candidate's geometry at the time) and the checked evaluation.
import { readdir, readFile } from "node:fs/promises";
import type { PriorEvaluation } from "../build/evaluations.ts";
import type { Evaluation } from "./check.ts";
import type { Context } from "./context.ts";

export const EVALUATIONS = "data/evaluations";

/** Every folder with both a context.json and an evaluation.json. Folders still waiting on the batch are skipped. */
export async function loadEvaluations(dir = EVALUATIONS): Promise<PriorEvaluation[]> {
  let folders: string[];
  try { folders = await readdir(dir); } catch { return []; }
  const out: PriorEvaluation[] = [];
  for (const f of folders.sort()) {
    let context: Context, evaluation: Evaluation;
    try {
      [context, evaluation] = await Promise.all(["context", "evaluation"].map(async (n) => JSON.parse(await readFile(`${dir}/${f}/${n}.json`, "utf8"))));
    } catch { continue; }
    out.push({ candidate: context.id, kind: context.kind, line: context.line, side: context.side ?? null, evaluation });
  }
  return out;
}
