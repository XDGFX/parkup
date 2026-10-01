# /// script
# dependencies = ["pillow"]
# ///
"""PROTOTYPE — throwaway. Gathers the evaluation inputs for each known spot in spots.json.

For each spot: the kerb line (OSM centreline offset 5 m to one side), cut into chunks of at most
CHUNK_M metres. For each chunk: an Esri World Imagery tile and a Queensland 2022 aerial of the same
box with the kerb drawn on, the Esri capture date, and the QLD DEM sampled along the kerb. Plus every
council sign within SIGN_M metres of the kerb. Writes out/<id>/{chunk images, context.json}.

    uv run prototype/evaluation/fetch.py
"""
import io
import json
import math
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).parent
OUT = HERE / "out"
UA = {"User-Agent": "parkup-prototype"}
CHUNK_M = 150  # longest kerb shown in one image
PAD_M = 30  # context around the kerb in each image
M_PER_PX = 0.15
SIGN_M = 15
DEM_STEP_M = 5

ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
QLD = "https://spatial-img.information.qld.gov.au/arcgis/rest/services"
SIGNS = "https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/parking-sign-locations/records"


def get(url, params=None, raw=False):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    for attempt in range(4):  # the QLD services drop the odd request
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                body = r.read()
            break
        except (urllib.error.HTTPError, TimeoutError):
            if attempt == 3:
                raise
            __import__("time").sleep(2 * (attempt + 1))
    return body if raw else json.loads(body)


# --- geometry (local metres around the first point; fine at street scale) ---

def frame(lat0):
    return 111320 * math.cos(math.radians(lat0)), 110540


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


def offset(coords, metres):
    """Shift a lon/lat polyline sideways by `metres` (positive = left)."""
    mx, my = frame(coords[0][1])
    out = []
    for i, (x, y) in enumerate(coords):
        a, b = coords[max(i - 1, 0)], coords[min(i + 1, len(coords) - 1)]
        dx, dy = (b[0] - a[0]) * mx, (b[1] - a[1]) * my
        n = math.hypot(dx, dy) or 1
        out.append([x - dy / n * metres / mx, y + dx / n * metres / my])
    return out


def resample(coords, step):
    """Points every `step` metres along the line, ending on the last vertex."""
    mx, my = frame(coords[0][1])
    pts, carry = [coords[0]], 0.0
    for a, b in zip(coords, coords[1:]):
        seg = math.hypot((b[0] - a[0]) * mx, (b[1] - a[1]) * my)
        d = step - carry
        while d <= seg:
            t = d / seg
            pts.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
            d += step
        carry = seg - (d - step)
    if pts[-1] != coords[-1]:
        pts.append(coords[-1])
    return pts


def length(coords):
    mx, my = frame(coords[0][1])
    return sum(math.hypot((b[0] - a[0]) * mx, (b[1] - a[1]) * my) for a, b in zip(coords, coords[1:]))


def chunks(coords):
    """Split the kerb into roughly equal pieces no longer than CHUNK_M."""
    n = max(1, math.ceil(length(coords) / CHUNK_M))
    pts = resample(coords, 1)
    size = math.ceil(len(pts) / n)
    return [pts[i:i + size + 1] for i in range(0, len(pts) - 1, size)]


def dist_to_line(p, line):
    mx, my = frame(p[1])
    px, py = p[0] * mx, p[1] * my
    best = math.inf
    for a, b in zip(line, line[1:]):
        ax, ay, bx, by = a[0] * mx, a[1] * my, b[0] * mx, b[1] * my
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / ((dx * dx + dy * dy) or 1)))
        best = min(best, math.hypot(px - ax - t * dx, py - ay - t * dy))
    return best


def merc(lon, lat):
    return lon * 20037508.34 / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * 20037508.34 / math.pi


# --- sources ---

def osm_way(way_id):
    els = get(f"https://api.openstreetmap.org/api/0.6/way/{way_id}/full.json")["elements"]
    nodes = {e["id"]: [e["lon"], e["lat"]] for e in els if e["type"] == "node"}
    way = next(e for e in els if e["type"] == "way")
    return [nodes[n] for n in way["nodes"]], way.get("tags", {})


def esri_date(lon, lat):
    """Capture date of the finest Esri imagery at this point, from its metadata layers."""
    best = None
    for layer in range(5, 19):
        feats = get(f"{ESRI}/{layer}/query", dict(
            geometry=f"{lon},{lat}", geometryType="esriGeometryPoint", inSR=4326,
            spatialRel="esriSpatialRelIntersects", outFields="SRC_DATE,SRC_RES,SRC_DESC,NICE_DESC,MaxMapLevel",
            returnGeometry="false", f="json")).get("features", [])
        for f in feats:
            a = f["attributes"]
            if a["SRC_DATE"] and (best is None or a["SRC_RES"] < best["SRC_RES"]):
                best = a
    if not best:
        return None
    d = str(best["SRC_DATE"])
    return dict(date=f"{d[:4]}-{d[4:6]}-{d[6:]}", resolution_m=best["SRC_RES"],
                sensor=f'{best["NICE_DESC"]} {best["SRC_DESC"]}')


def qld_capture(lon, lat):
    r = get(f"{QLD}/Basemaps/LatestStateProgram_AllUsers/ImageServer/identify", dict(
        geometry=json.dumps(dict(x=lon, y=lat, spatialReference=dict(wkid=4326))),
        geometryType="esriGeometryPoint", returnCatalogItems="true", returnGeometry="false", f="json"))
    items = [f["attributes"] for f in r["catalogItems"]["features"]]
    a = min(items, key=lambda a: a["lowps"])  # finest dataset covering the point
    day = lambda ms: __import__("datetime").datetime.utcfromtimestamp(ms / 1000).date().isoformat()
    return dict(dataset=a["name"], start=day(a["capturestart"]), end=day(a["captureend"]),
                resolution_m=a["res_value"] / 100)


def dem(points):
    for attempt in range(4):  # errors come back as a 200 with an `error` body
        r = get(f"{QLD}/Elevation/QldDem/ImageServer/getSamples", dict(
            geometry=json.dumps(dict(points=points, spatialReference=dict(wkid=4326))),
            geometryType="esriGeometryMultipoint", returnFirstValueOnly="true", f="json"))
        if "samples" in r:
            break
        print("  DEM error:", str(r)[:120])
        __import__("time").sleep(3 * (attempt + 1))
    else:
        return [None] * len(points)
    by_id = {s["locationId"]: float(s["value"]) for s in r["samples"] if s["value"] not in ("NoData", "")}
    return [by_id.get(i) for i in range(len(points))]


def signs_near(line):
    mx, my = frame(line[0][1])
    lons, lats = [p[0] for p in line], [p[1] for p in line]
    pad_x, pad_y = SIGN_M / mx, SIGN_M / my
    poly = (f"POLYGON(({min(lons) - pad_x} {min(lats) - pad_y}, {max(lons) + pad_x} {min(lats) - pad_y}, "
            f"{max(lons) + pad_x} {max(lats) + pad_y}, {min(lons) - pad_x} {max(lats) + pad_y}, "
            f"{min(lons) - pad_x} {min(lats) - pad_y}))")
    rows = get(SIGNS, {"where": f"within(geo_point_2d, geom'{poly}')", "limit": 100})["results"]
    out = []
    for s in rows:
        p = [s["geo_point_2d"]["lon"], s["geo_point_2d"]["lat"]]
        d = dist_to_line(p, line)
        if d <= SIGN_M:
            out.append(dict(street=s["street"], restriction=s["parkingrestrictiontype"],
                            days_times=s["parkingrestrictiondaysandtimes"],
                            extra_text=s["parkingrestrictiondescription"], arrow=s["signdirection"],
                            metres_from_kerb_line=round(d, 1), lon=round(p[0], 6), lat=round(p[1], 6)))
    return out


def buildings_near(line, radius=60):
    """The nearest OSM buildings to the line, with their type and distance in metres."""
    mx, my = frame(line[0][1])
    lons, lats = [p[0] for p in line], [p[1] for p in line]
    bb = f"{min(lons) - radius / mx},{min(lats) - radius / my},{max(lons) + radius / mx},{max(lats) + radius / my}"
    els = get(f"https://api.openstreetmap.org/api/0.6/map.json?bbox={bb}")["elements"]
    nodes = {e["id"]: [e["lon"], e["lat"]] for e in els if e["type"] == "node"}
    along = resample(line, 1) if length(line) else line  # 1 m steps, so the index is metres along
    out = []
    for e in els:
        tags = e.get("tags", {})
        if e["type"] == "way" and "building" in tags:
            pts = [nodes[n] for n in e["nodes"] if n in nodes]
            d, at = min((math.hypot((p[0] - q[0]) * mx, (p[1] - q[1]) * my), i)
                        for p in pts for i, q in enumerate(along))
            if d <= radius:
                out.append(dict(building=tags["building"], name=tags.get("name"), metres=round(d), at_m=at))
    out.sort(key=lambda b: b["metres"])
    return out[:8] if len(along) < 3 else out[:25]


def image(service_url, bbox, size, kind):
    params = dict(bbox=",".join(map(str, bbox)), bboxSR=3857, imageSR=3857, size=f"{size[0]},{size[1]}",
                  format="jpg", f="image")
    if kind == "qld":
        params["interpolation"] = "RSP_BilinearInterpolation"
        url = f"{service_url}/exportImage"
    else:
        url = f"{service_url}/export"
    return Image.open(io.BytesIO(get(url, params, raw=True))).convert("RGB")


def draw_kerb(img, bbox, kerb, signs, pin=None):
    """Kerb in yellow with a start marker (or just a ring on a pin); signs as small cyan dots."""
    x0, y0, x1, y1 = bbox
    w, h = img.size
    px = lambda lon, lat: ((merc(lon, lat)[0] - x0) / (x1 - x0) * w, (y1 - merc(lon, lat)[1]) / (y1 - y0) * h)
    d = ImageDraw.Draw(img)
    if pin:
        sx, sy = px(*pin)
        d.ellipse([sx - 14, sy - 14, sx + 14, sy + 14], outline=(255, 220, 0), width=3)
    else:
        d.line([px(*p) for p in kerb], fill=(255, 220, 0), width=3)
        sx, sy = px(*kerb[0])
        d.ellipse([sx - 6, sy - 6, sx + 6, sy + 6], outline=(255, 220, 0), width=3)
    for s in signs:
        cx, cy = px(s["lon"], s["lat"])
        d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(0, 230, 255))
    return img


def main():
    OUT.mkdir(exist_ok=True)
    for spot in json.loads((HERE / "spots.json").read_text()):
        if sys.argv[1:] and spot["id"] not in sys.argv[1:]:
            continue
        print(f"== {spot['id']}")
        pin = spot.get("point")
        ways = [osm_way(w) for w in spot.get("ways", [])]
        if pin:
            # a dropped pin: slope from an east-west and a north-south line through it, one 100 m box
            mx, my = frame(pin[1])
            kerb = [[pin[0] - 20 / mx, pin[1]], [pin[0] + 20 / mx, pin[1]]]
            ns = [[pin[0], pin[1] - 20 / my], [pin[0], pin[1] + 20 / my]]
        else:
            centre = join([g for g, _ in ways])
            # an off-street area (side 0) is evaluated along its own outline
            kerb = offset(centre, 5 * spot["side"]) if spot["side"] else centre
        signs = signs_near(kerb)
        d = OUT / spot["id"]
        d.mkdir(exist_ok=True)

        samples = resample(kerb, DEM_STEP_M)
        elev = dem(samples)
        if pin:
            ns_samples = resample(ns, DEM_STEP_M)
            elev += [None] + dem(ns_samples)  # None keeps the two lines from joining into one grade
        grades = [abs(b - a) / DEM_STEP_M * 100 for a, b in zip(elev, elev[1:]) if a is not None and b is not None]
        valid = [e for e in elev if e is not None]

        pieces = []
        boxes = [[[pin[0] - 50 / mx, pin[1] - 50 / my], [pin[0] + 50 / mx, pin[1] + 50 / my]]] if pin else chunks(kerb)
        for i, piece in enumerate(boxes, 1):
            mx, my = frame(piece[0][1])
            lons, lats = [p[0] for p in piece], [p[1] for p in piece]
            lo = merc(min(lons) - PAD_M / mx, min(lats) - PAD_M / my)
            hi = merc(max(lons) + PAD_M / mx, max(lats) + PAD_M / my)
            bbox = [lo[0], lo[1], hi[0], hi[1]]
            ground = [(hi[0] - lo[0]) * math.cos(math.radians(lats[0])), (hi[1] - lo[1]) * math.cos(math.radians(lats[0]))]
            size = [min(1600, round(ground[0] / M_PER_PX)), min(1600, round(ground[1] / M_PER_PX))]
            mid = piece[len(piece) // 2]
            names = {}
            for kind, url in (("esri", f"{ESRI}"), ("qld", f"{QLD}/Basemaps/LatestStateProgram_AllUsers/ImageServer")):
                img = draw_kerb(image(url, bbox, size, kind), bbox, piece, signs, pin)
                names[kind] = f"chunk{i}-{kind}.jpg"
                img.save(d / names[kind], quality=88)
            pieces.append(dict(chunk=i, length_m=round(length(piece)), images=names,
                               esri_capture=esri_date(*mid), qld_capture=qld_capture(*mid),
                               ground_size_m=[round(g) for g in ground], image_px=size))
            print(f"  chunk {i}: {pieces[-1]['length_m']} m, {size[0]}x{size[1]} px")

        osm_tags = {k: v for _, tags in ways for k, v in tags.items()
                    if k in ("highway", "maxspeed", "oneway", "lanes", "lit", "surface", "width", "sidewalk")
                    or k.startswith("parking")}
        context = dict(
            id=spot["id"], street=spot["street"], suburb=spot["suburb"],
            kind="point" if pin else "off-street area" if not spot["side"] else "kerb",
            kerb=dict(length_m=round(length(kerb)),
                      side="pin" if pin else {1: "left", -1: "right", 0: "outline of the area"}[spot["side"]],
                      start=[round(c, 6) for c in kerb[0]], end=[round(c, 6) for c in kerb[-1]]),
            osm_tags=osm_tags,
            slope=dict(step_m=DEM_STEP_M, elevation_m=[round(e, 2) if e is not None else None for e in elev],
                       min_elevation_m=round(min(valid), 1), max_elevation_m=round(max(valid), 1),
                       mean_grade_pct=round(sum(grades) / len(grades), 1), max_grade_pct=round(max(grades), 1),
                       flattest_20m_grade_pct=round(min(
                           (abs(elev[i + 4] - elev[i]) / 20 * 100 for i in range(len(elev) - 4)
                            if elev[i] is not None and elev[i + 4] is not None), default=0), 1)),
            signs=[{k: v for k, v in s.items() if k not in ("lon", "lat")} for s in signs],
            buildings=buildings_near([pin, pin] if pin else kerb, 100 if pin else 60),
            chunks=pieces,
        )
        (d / "context.json").write_text(json.dumps(context, indent=2))
        print(f"  {len(signs)} signs, max grade {context['slope']['max_grade_pct']}%")


if __name__ == "__main__":
    main()
