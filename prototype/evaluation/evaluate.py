"""PROTOTYPE — throwaway. Runs one headless Sonnet session per spot over the inputs fetch.py wrote.

Each spot gets `claude -p` with only the Read tool, cwd set to its folder, the rubric as the prompt
and schema.json as the structured output. Writes out/<id>/evaluation.json with the verdict plus the
run's time and turns.

    python3 prototype/evaluation/evaluate.py [spot-id ...]
"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
MODEL = "sonnet"
RUBRIC = "v5"


def evaluate(folder):
    ctx = json.loads((folder / "context.json").read_text())
    started = datetime.now(timezone.utc)
    run = subprocess.run(
        ["claude", "-p", (HERE / "rubric.md").read_text(), "--model", MODEL, "--output-format", "json",
         "--json-schema", (HERE / "schema.json").read_text(), "--allowedTools", "Read",
         "--no-session-persistence", "--max-budget-usd", "2"],
        cwd=folder, capture_output=True, text=True, timeout=600)
    res = json.loads(run.stdout)
    out = dict(
        candidate=ctx["id"],
        **(res.get("structured_output") or {"error": res.get("result")}),
        imagery=dict(esri=sorted({c["esri_capture"]["date"] for c in ctx["chunks"]}),
                     qld=ctx["chunks"][0]["qld_capture"]["start"][:7]),
        evaluated_at=started.isoformat(timespec="seconds"),
        rubric=RUBRIC,
        model=next((m for m in res.get("modelUsage", {}) if MODEL in m), MODEL),
        run=dict(seconds=round(res.get("duration_ms", 0) / 1000), turns=res.get("num_turns")),
    )
    (folder / "evaluation.json").write_text(json.dumps(out, indent=2))
    return out


def main():
    ids = sys.argv[1:] or sorted(p.name for p in (HERE / "out").iterdir() if p.is_dir())
    with ThreadPoolExecutor(4) as pool:
        for e in pool.map(evaluate, [HERE / "out" / i for i in ids]):
            print(f"{e['candidate']:12} {e.get('verdict', 'ERROR'):6} {e['run']['seconds']}s  "
                  f"{e.get('summary', e.get('error'))}")


if __name__ == "__main__":
    main()
