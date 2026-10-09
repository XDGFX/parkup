# Evaluation batch prompt

Paste this into an interactive Claude Code session at the repository root, on the user's subscription. The
session fans out Sonnet subagents; it needs no API key and tracks no cost. For a real batch, run it on `main`:
the session commits, pushes, waits for the deploy and then asks you to check the app on your phone.

---

You're running a parkup evaluation batch. Read `CONTEXT.md` for the vocabulary. Work through these steps.

1. **Pick the candidates.** Either the calibration set (`--calibration`, folders under `data/calibration/`)
   or real candidates (folders under `data/evaluations/`). For real candidates, run `npm run build:data`
   then `npm run evaluate -- queue` (add `--force` only when told to redo everything). It lists the
   candidates without a current evaluation, in tier order, already grouped by suburb into groups of up
   to 8; candidates that inherited a current evaluation from an earlier build are left out. Take groups
   from the top. For the calibration set, skip any folder that already has an `evaluation.json` with the
   current rubric version (the first line of `src/evaluate/rubric.md`), unless told to redo everything.
2. **Prepare the context.** Run `npm run evaluate -- prepare --calibration [place-id ...]` or
   `npm run evaluate -- prepare <candidate-id ...>`. It writes `context.json` per folder and the imagery to
   the gitignored `.cache/imagery/`. If Esri refuses keyless export, a chunk's `images.esri` is `null` and
   the agents use the QLD aerial alone. Re-run it for any folder that failed.
3. **Group the work.** For a real batch, one group per line of the queue. For the calibration set, up to
   about 8 known places per group.
4. **Fan out.** For each group, start a subagent with the Agent tool, `model: "sonnet"`, all groups in one
   message so they run in parallel. Give each the prompt below with its folders filled in.
5. **Check and stamp.** When the subagents finish, run
   `npm run evaluate -- check --model <the model id the subagents reported> <folder ...>`. It validates each
   `agent.json` against `src/evaluate/schema.json`, applies the code rule-outs (a mapped dwelling within
   about 10 m of the best section, a mapped gate on the only access), resolves the best section to lon/lat
   points, stamps the imagery dates, `evaluated_at`, the model and the rubric version, and writes
   `evaluation.json`. Send any folder it rejects back to a fresh subagent with the error.
6. **Calibration only:** run `npm run evaluate -- calibrate`. It writes `data/calibration/report.md` and
   fails unless every good and poor call of the user's matches and every known place was judged under the
   current rubric version. `queue` and `prepare` for a real batch refuse to run until it passes; don't
   pass `--skip-calibration-gate` unless the user tells you to.
7. **Real batch only: publish after every round.** A round is one set of groups fanned out together. As
   soon as a round's `check` is done (and before stopping for a usage limit, if you can), run
   `npm run build:data` to fold the new evaluations into `public/candidates.json`, then commit the
   `context.json`, `agent.json` and `evaluation.json` files and the rebuilt dataset and push `main`. The
   user has authorised this session to commit and push directly to `main`; do all the git yourself. Then
   take the next round from a fresh `npm run evaluate -- queue`.
8. **Calibration only:** commit the `context.json`, `agent.json` and `evaluation.json` files and the report.
9. Never commit imagery (`.cache/` is gitignored; don't force-add it).
10. **If a usage limit stops the batch,** tell the user to paste this prompt again once the limit resets.
    `queue` skips every candidate that already has a current evaluation, so the batch picks up where it
    stopped. Commit and push whatever `check` has already stamped before you stop.

## Real batch: deploy and spot-check with the user

Once the queue is empty (or after the last round you can run):

1. **Wait for the deploy.** Pushing `main` triggers the GitHub Pages workflow. Find its run with
   `gh run list --workflow pages.yml --branch main --limit 1`, then `gh run watch <run id> --exit-status`.
   If it fails, read `gh run view <run id> --log-failed`, fix the cause, commit, push and watch again.
   Don't hand over to the user until a deploy of your last commit has succeeded.
2. **Stop and ask the user to check on their phone** at <https://xdgfx.github.io/parkup/>. Give them:
   - About 10 spot-check candidates from this batch, a mix of `good` and `maybe`, preferring ones in
     Taringa, Indooroopilly and St Lucia. For each: street and suburb (`context.json`), the verdict and
     summary (`evaluation.json`), and a Google Maps link to its best section:
     `https://www.google.com/maps/search/?api=1&query=<lat>,<lon>`, using the middle of
     `best_section.points` (each point is `[lon, lat]`).
   - This phone checklist:
     - toilet pins are grey across Tonight, Weekend and Now;
     - a candidate's card shows the nearest toilet with its distance and hours;
     - the install banner appears once only;
     - Add to Home Screen opens full-screen with the icon;
     - kerb dots show their kind icon at suburb zoom;
     - `maybe` and `poor` pins show distinct colours.

   Ask them to reply in this session with what they found, then wait.
3. **When the user replies:**
   - Post their findings as a comment on issue #21 with `gh issue comment 21 --body-file -`: each
     spot-check candidate with their verdict against the agent's, each checklist item passed or failed,
     and any rubric changes they suggest.
   - Fix any app bug they report test-first: a failing test, then the fix, then `npm test` and
     `npm run typecheck`. Commit, push `main`, wait for the deploy as in step 1 and ask them to re-check.
   - Don't apply rubric changes they suggest silently. Propose the wording as a diff, and note that any
     rubric change bumps its version and needs the calibration set re-run before another batch.
   - Repeat until the user says they're happy. Then close #21 and #14
     (`gh issue close 21` and `gh issue close 14`, each with a one-line comment).

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
