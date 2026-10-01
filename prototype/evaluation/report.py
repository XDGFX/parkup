"""PROTOTYPE — throwaway. Renders out/report.html: each spot's images next to its evaluation.

    python3 prototype/evaluation/report.py && open prototype/evaluation/out/report.html
"""
import html
import json
from pathlib import Path

OUT = Path(__file__).parent / "out"


def section(d, known):
    ctx = json.loads((d / "context.json").read_text())
    ev = json.loads((d / "evaluation.json").read_text())
    lon, lat = ctx["kerb"]["start"]
    bs = ev["best_section"] or {}
    imgs = "".join(f'<figure><img src="{d.name}/{c["images"][k]}"><figcaption>chunk {c["chunk"]} · {k} '
                   f'{c["esri_capture"]["date"] if k == "esri" else c["qld_capture"]["start"][:7]}</figcaption></figure>'
                   for c in ctx["chunks"] for k in ("esri", "qld"))
    rows = "".join(f"<tr><th>{k}</th><td>{html.escape(v)}</td></tr>" for k, v in ev["drivers"].items())
    rows += "".join(f"<tr><th>{k}</th><td>{html.escape(v)}</td></tr>" for k, v in
                    (("flags", "; ".join(ev["flags"])), ("sun and shade", ev["sun_shade"]), ("rubbish", ev["rubbish"])))
    signs = "".join(f"<li>{html.escape(str(s['restriction']))} {html.escape(str(s['days_times'] or ''))} "
                    f"({s['arrow']}, {s['metres_from_kerb_line']} m)</li>" for s in ctx["signs"])
    return f"""
<section>
  <h2>{ctx['street']}, {ctx['suburb']} <span class="v {ev['verdict']}">{ev['verdict']}</span></h2>
  <p class="known">You: {html.escape(known)}</p>
  <p class="sum">{html.escape(ev['summary'])}</p>
  <ul>{''.join(f'<li>{html.escape(r)}</li>' for r in ev['reasons'])}</ul>
  <p class="meta">{ev['kind']} · best section {bs.get('from_m')}–{bs.get('to_m')} m: {html.escape(bs.get('where', 'none'))}
    · slope {bs.get('slope_pct')}% · confidence {ev['confidence']}
    · <a href="https://www.google.com/maps/search/?api=1&query={lat},{lon}">start in Google Maps</a>
    · {ev['run']['seconds']} s, {ev['model']}, rubric {ev.get('rubric')}</p>
  <div class="imgs">{imgs}</div>
  <table>{rows}<tr><th>cannot judge</th><td>{html.escape('; '.join(ev['cannot_judge']))}</td></tr></table>
  <details><summary>{len(ctx['signs'])} council signs within 15 m</summary><ul>{signs}</ul></details>
</section>"""


def main():
    known = {s["id"]: s["known"] for s in json.loads((OUT.parent / "spots.json").read_text())}
    body = "".join(section(d, known[d.name]) for d in sorted(OUT.iterdir()) if (d / "evaluation.json").exists())
    (OUT / "report.html").write_text(f"""<!doctype html><meta charset="utf-8"><title>Evaluation prototype</title>
<style>
body{{font:15px/1.45 system-ui;max-width:1200px;margin:2em auto;padding:0 16px;background:#16181b;color:#e6e6e6}}
a{{color:#9cc4ff}} .known{{color:#c9b98a}} h2{{margin-top:2.5em}} .sum{{font-size:1.15em}} .meta{{color:#9a9a9a}}
.v{{font-size:.6em;padding:.2em .6em;border-radius:1em;vertical-align:middle;background:#555}}
.good{{background:#2e7d4f}} .maybe{{background:#9a7a1c}} .poor{{background:#8a2c2c}}
.imgs{{display:flex;flex-wrap:wrap;gap:8px}} figure{{margin:0}} img{{max-width:580px;width:100%;display:block}}
figcaption{{font-size:.8em;color:#9a9a9a}} th{{text-align:left;vertical-align:top;padding-right:1em;color:#bbb}}
table{{margin-top:1em;border-collapse:collapse}} td,th{{padding:.3em 0;border-bottom:1px solid #2a2d31}}
</style>
<h1>PROTOTYPE — evaluation rubric on known spots</h1>
<p>Yellow line: the kerb evaluated (start ringed). Cyan dots: council signs. Throwaway; see #6.</p>{body}""")
    print(OUT / "report.html")


if __name__ == "__main__":
    main()
