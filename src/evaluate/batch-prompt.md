# Evaluation batch prompt

Paste this into an interactive Claude Code session at the repository root, on the user's subscription. The
session fans out Sonnet subagents; it needs no API key and tracks no cost.

---

You're running a parkup evaluation batch. Read `CONTEXT.md` for the vocabulary. Work through these steps.

1. **Pick the candidates.** Either the calibration set (`--calibration`, folders under `data/calibration/`)
   or the candidate ids you were given (folders under `data/evaluations/`). Skip any folder that already
   has an `evaluation.json` with the current rubric version (the first line of `src/evaluate/rubric.md`),
   unless told to redo everything.
2. **Prepare the context.** Run `npm run evaluate -- prepare --calibration [spot-id ...]` or
   `npm run evaluate -- prepare <candidate-id ...>`. It writes `context.json` per folder and the imagery to
   the gitignored `.cache/imagery/`. If Esri refuses keyless export, a chunk's `images.esri` is `null` and
   the agents use the QLD aerial alone. Re-run it for any folder that failed.
3. **Group the work.** Up to about 8 candidates per group, grouped by suburb, in the order given (tier order
   for a real batch).
4. **Fan out.** For each group, start a subagent with the Agent tool, `model: "sonnet"`, all groups in one
   message so they run in parallel. Give each the prompt below with its folders filled in.
5. **Check and stamp.** When the subagents finish, run
   `npm run evaluate -- check --model <the model id the subagents reported> <folder ...>`. It validates each
   `agent.json` against `src/evaluate/schema.json`, applies the code rule-outs (a mapped dwelling within
   about 10 m of the best section, a mapped gate on the only access), resolves the best section to lon/lat
   points, stamps the imagery dates, `evaluated_at`, the model and the rubric version, and writes
   `evaluation.json`. Send any folder it rejects back to a fresh subagent with the error.
6. **Calibration only:** run `npm run evaluate -- calibrate`. It writes `data/calibration/report.md` and
   fails unless every good and poor call of the user's matches. Don't start a real batch on a failing
   calibration.
7. Commit the `context.json`, `agent.json` and `evaluation.json` files (and the report). Never commit imagery.

## Subagent prompt

> You're evaluating parkup candidates from overhead imagery. Your folders, relative to the repository root
> `<repo root>`:
>
> - `<folder 1>`
> - `<folder 2>`
> - …
>
> First read `<repo root>/src/evaluate/rubric.md` (how to judge) and `<repo root>/src/evaluate/schema.json`
> (the output format). Then, for each folder in turn:
>
> 1. Read `<folder>/context.json`, then every image listed under `chunks` → `images` (paths relative to the
>    repository root; skip a `null` one).
> 2. Judge the candidate by the rubric.
> 3. **Straight away**, before starting the next folder, write your evaluation to `<folder>/agent.json`: a
>    single JSON object that matches the schema exactly, with no extra fields and no comments. Writing each
>    one as soon as it's done means a usage-limit stop loses little.
>
> Use only the Read and Write tools. Don't fetch anything from the web and don't edit any other file. When
> you've done every folder, reply with your exact model id and one line per folder: its id and verdict.
