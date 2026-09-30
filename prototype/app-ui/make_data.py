"""PROTOTYPE — builds placeholder data.js for the App UI mock-up (issue #7).

Kerb lines are real OSM road centrelines offset ~5 m to one side. Everything
else (sign rules, frontage, evaluations, toilet names and hours) is invented.

    python3 prototype/app-ui/make_data.py path/to/osm.json

osm.json is an Overpass `out geom` dump of the ways below plus amenity=toilets.
"""

import json
import math
import sys
from pathlib import Path

WEEKDAYS = [1, 2, 3, 4, 5]
ALL = [1, 2, 3, 4, 5, 6, 7]

# way ids, kerb side (+1 left of drawing direction, -1 right), invented attributes
CANDIDATES = [
    dict(ways=[6878515, 48036177, 1128179216], side=-1, street="Heroes Ave", suburb="Taringa",
         frontage="Park", rules=[],
         evaluation=dict(verdict="good", summary="Flat, wide kerb beside the community garden. No houses face it.",
                         reasons=["Park frontage, nobody overlooking", "Kerb grade about 2%", "Tree cover on the east end"],
                         imagery="Esri 2025-10", slope=2)),
    dict(ways=[23268800, 1125290316], side=1, street="Keith St", suburb="St Lucia",
         frontage="Park", rules=[dict(days=ALL, start=5, end=7, kind="no", label="No parking 5–7am")],
         evaluation=dict(verdict="good", summary="Quiet dead end by Guyatt Park. Early street sweeping on the sign.",
                         reasons=["Park frontage", "Dead end, little through traffic", "Leave by 5am"],
                         imagery="Esri 2025-09", slope=1)),
    dict(ways=[5883997], side=-1, street="Marmion Pde", suburb="Taringa",
         frontage="Rail corridor", rules=[],
         evaluation=dict(verdict="maybe", summary="Faces the rail line. Level, but trains until about 1am.",
                         reasons=["Rail corridor frontage", "Train noise late and early", "Kerb grade about 4%"],
                         imagery="Esri 2025-10", slope=4)),
    dict(ways=[47413427], side=1, street="Adsett St", suburb="Taringa",
         frontage="Park", rules=[dict(days=WEEKDAYS, start=7, end=18, kind="limit", label="2P 7am–6pm Mon–Fri")],
         evaluation=dict(verdict="maybe", summary="Short stretch opposite houses. Steep at the top end.",
                         reasons=["Houses opposite", "Kerb grade about 9%", "2P in the daytime on weekdays"],
                         imagery="Esri 2025-10", slope=9)),
    dict(ways=[24356199], side=1, street="Carmody Rd", suburb="St Lucia",
         frontage="Special purpose", rules=[dict(days=WEEKDAYS, start=7, end=18, kind="limit", label="2P 7am–6pm Mon–Fri (SLTA)")],
         evaluation=None),
    dict(ways=[24223947], side=-1, street="Harts Rd", suburb="Indooroopilly",
         frontage="Industry", rules=[dict(days=ALL, start=22, end=24, kind="no", label="No parking 10pm–6am"),
                                     dict(days=ALL, start=0, end=6, kind="no", label="")],
         evaluation=dict(verdict="poor", summary="Overnight ban on the plate. Fine for a daytime stop.",
                         reasons=["Industry frontage", "No parking 10pm–6am", "Wide, flat kerb"],
                         imagery="Esri 2025-11", slope=1)),
    dict(ways=[1078957983], side=1, street="Central Ave", suburb="Indooroopilly",
         frontage="Residential", rules=[],
         evaluation=dict(verdict="poor", summary="Houses on both sides, with driveways every 15 m.",
                         reasons=["Residential frontage", "Many driveways", "Narrow carriageway"],
                         imagery="Esri 2025-10", slope=3)),
    dict(ways=[1164071404, 1090665507, 1090665508, 1090665509, 574883156, 512408177], side=-1, street="Sir Fred Schonell Dr", suburb="St Lucia",
         frontage="Special purpose", rules=[dict(days=WEEKDAYS, start=7, end=18, kind="limit", label="2P 7am–6pm Mon–Fri (SLTA)")],
         evaluation=dict(verdict="good", summary="Campus edge. Empty after 6pm and on weekends.",
                         reasons=["University frontage", "Lit and quiet at night", "Kerb grade about 3%"],
                         imagery="Esri 2025-09", slope=3)),
    dict(ways=[7918586], side=1, street="Hillsdon Rd", suburb="Taringa",
         frontage="Residential", rules=[],
         evaluation=None),
]

TOILETS = [
    (7796153725, "Guyatt Park", "24 hours"),
    (264662062, "UQ Great Court", "Weekdays 7am–10pm"),
    (4423172999, "Indooroopilly Shopping Centre", "Shop hours"),
    (11715189411, "Taringa station", "First to last train"),
    (11620074385, "Taringa Village", "Daylight hours"),
    (11505325182, "Anstey Street park", "Daylight hours"),
    (12210285320, "St Lucia Golf Links", "24 hours"),
    (5463560020, "Indooroopilly station", "First to last train"),
    (320411492, "Toowong Memorial Park", "Daylight hours"),
]


def offset(coords, metres):
    """Shift a lon/lat polyline sideways by `metres` (positive = left)."""
    lat0 = math.radians(coords[0][1])
    mx, my = 111320 * math.cos(lat0), 110540
    out = []
    for i, (x, y) in enumerate(coords):
        a = coords[max(i - 1, 0)]
        b = coords[min(i + 1, len(coords) - 1)]
        dx, dy = (b[0] - a[0]) * mx, (b[1] - a[1]) * my
        n = math.hypot(dx, dy) or 1
        out.append([round(x - dy / n * metres / mx, 6), round(y + dx / n * metres / my, 6)])
    return out


def length(coords):
    lat0 = math.radians(coords[0][1])
    return sum(math.hypot((b[0] - a[0]) * 111320 * math.cos(lat0), (b[1] - a[1]) * 110540)
               for a, b in zip(coords, coords[1:]))


def join(ways):
    """Chain ways into one line, flipping any that run backwards."""
    line = list(ways[0])
    for w in ways[1:]:
        if w[-1] == line[-1] or w[-1] == line[0]:
            w = w[::-1]
        if w[0] == line[0]:
            line = line[::-1]
        line += w[1:] if w[0] == line[-1] else w
    return line


def main():
    osm = json.load(open(sys.argv[1]))
    ways = {e["id"]: [[p["lon"], p["lat"]] for p in e["geometry"]] for e in osm["elements"] if e["type"] == "way"}
    nodes = {e["id"]: e for e in osm["elements"] if e["type"] == "node"}

    candidates = []
    for i, c in enumerate(CANDIDATES):
        kerb = offset(join([ways[w] for w in c["ways"]]), 5 * c["side"])
        candidates.append(dict(id=f"k{i + 1}", street=c["street"], suburb=c["suburb"], frontage=c["frontage"],
                               lengthM=round(length(kerb)), rules=c["rules"], evaluation=c["evaluation"], line=kerb))

    toilets = [dict(id=f"t{n}", name=name, hours=hours, lon=nodes[n]["lon"], lat=nodes[n]["lat"])
               for n, name, hours in TOILETS]

    out = Path(__file__).with_name("data.js")
    out.write_text("// PROTOTYPE placeholder data — generated by make_data.py. Kerb lines © OpenStreetMap contributors (ODbL).\n"
                   f"window.PARKUP = {json.dumps(dict(candidates=candidates, toilets=toilets))};\n")
    print(f"wrote {out} ({len(candidates)} candidates, {len(toilets)} toilets)")


if __name__ == "__main__":
    main()
