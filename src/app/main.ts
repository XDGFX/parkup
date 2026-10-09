// parkup: candidates on a dark map, faded when you can't stay for the chosen window, with a card per kerb stretch.
import { Map as MlMap, Marker, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent } from "maplibre-gl";
import type { Geometry } from "geojson";
// MapLibre finds its worker next to its own module, which bundling breaks, so hand it the bundled worker.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./style.css";
import type { Candidate } from "../build/build.ts";
import { installBanner } from "./install.ts";
import { addToiletLayer, loadToilets, paintToilets, toiletFact } from "./toilets.ts";
import { brisbane, canStay, fmtDay, fmtTime, limitName, MIN_STAY_HOURS, NOW_HOURS, outBy, windows, type Preset } from "../timetable/timetable.ts";

setWorkerUrl(workerUrl);

type LonLat = [number, number];
type Dataset = { candidates: Candidate[] };

const UNEVALUATED = "#9A9AA3";
// Kerb lines are too thin to tap at suburb zoom, so each stretch is a dot until street zoom.
const STREET_ZOOM = 15.5;
const MAP_COLOURS = { land: "#121214", water: "#0C1820", park: "#131916", building: "#1B1B1E", minor: "#26262A", major: "#35353B",
  motorway: "#45454D", casing: "#121214", rail: "#2A2A2F", label: "#85858E", halo: "#121214" };

const $ = <T extends Element = HTMLElement>(html: string) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The point halfway along a line, for the dot, the pulse and the Google Maps link. */
function midpoint(line: LonLat[]): LonLat {
  const seg = (a: LonLat, b: LonLat) => Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]);
  const lens = line.slice(1).map((p, i) => seg(line[i]!, p));
  let half = lens.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lens.length; i++) {
    if (half <= lens[i]!) {
      const t = lens[i] ? half / lens[i]! : 0, a = line[i]!, b = line[i + 1]!;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    half -= lens[i]!;
  }
  return line[0]!;
}

/** Where a candidate's dot, pulse and Google Maps link go: halfway along a kerb, the middle of a car park, or the site's point. */
function anchor(c: Candidate): LonLat {
  if (c.kind !== "parking-area" || c.line.length < 3) return midpoint(c.line);
  const pts = c.line.slice(0, -1);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

const KIND_NAMES: Record<Candidate["kind"], string> = { "kerb": "Kerb", "parking-area": "Parking area", "off-road": "Off-road site" };

/** A small icon per kind, drawn once onto a canvas: a kerb line, a P for a parking area, a peak for an off-road site. */
function kindIcon(kind: Candidate["kind"]): ImageData {
  const size = 32, cx = document.createElement("canvas").getContext("2d")!;
  cx.canvas.width = cx.canvas.height = size;
  cx.fillStyle = "#111113";
  cx.beginPath(); cx.arc(16, 16, 15, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = cx.fillStyle = "#E8E8EC";
  cx.lineWidth = 3; cx.lineCap = "round";
  if (kind === "kerb") { cx.beginPath(); cx.moveTo(9, 20); cx.lineTo(23, 12); cx.stroke(); }
  else if (kind === "parking-area") { cx.font = "bold 19px system-ui, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText("P", 16, 17); }
  else { cx.beginPath(); cx.moveTo(7, 22); cx.lineTo(14, 11); cx.lineTo(18, 17); cx.lineTo(20, 14); cx.lineTo(25, 22); cx.closePath(); cx.fill(); }
  return cx.getImageData(0, 0, size, size);
}

/** Frontage tier as a draw rank: tier 1 is 3 and drawn largest and on top; no frontage is 0. */
const rank = (c: Candidate) => 4 - (c.tier ?? 4);
const frontage = (c: Candidate) => (c.tier && c.frontage ? `Tier ${c.tier} · ${c.frontage.name}` : "Frontage unknown");

/** The line under the name: where it is, and what it is. */
function meta(c: Candidate): string {
  const parts = [c.suburb];
  if (c.kind === "kerb") parts.push(`${c.side} side`, `${Math.round(c.lengthM)} m of kerb`);
  else if (c.kind === "parking-area") parts.push("Off-street car park");
  else parts.push(c.trafficability ? `Track, ${c.trafficability}` : "Track or clearing");
  return parts.filter(Boolean).join(" · ");
}

const gmaps = (c: Candidate) => { const [lon, lat] = anchor(c); return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`; };

/** "8am", "8am tomorrow" or "9am Mon", relative to today in Brisbane. */
function fmtOut(d: Date, now = new Date()): string {
  const day = (x: Date) => { const b = brisbane(x); return Date.UTC(b.year, b.month - 1, b.date) / 864e5; };
  const days = day(d) - day(now);
  return `${fmtTime(d)}${days === 0 ? "" : days === 1 ? " tomorrow" : ` ${fmtDay(d)}`}`;
}

/** A plate as it looks on the post: the restriction, with its days and times underneath. */
function plate(text: string): string {
  const i = text.search(/\s(?=(MON|TUE|WED|THU|FRI|SAT|SUN|DAILY|SCHOOL|AT ALL|ALL OTHER|null|:))/i);
  const [head, tail] = i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i + 1)];
  const red = /^No |Zone|Clearway|Accessible/i.test(head);
  return `<span class="plate${red ? " red" : ""}">${esc(head)}${tail ? `<small>${esc(tail)}</small>` : ""}</span>`;
}

// Recolour OpenFreeMap's dark style to neutral graphite, so the base map belongs to the look.
function recolour(map: MlMap) {
  const p = MAP_COLOURS;
  for (const l of map.getStyle().layers) {
    const id = l.id;
    const set = (k: Parameters<MlMap["setPaintProperty"]>[1], v: string | number) => { try { map.setPaintProperty(id, k, v); } catch { /* not every layer has every paint property */ } };
    const hide = () => map.setLayoutProperty(id, "visibility", "none");
    if (l.type === "background") set("background-color", p.land);
    else if (l.type === "symbol") { if (/shield|oneway/.test(id)) hide(); else { set("text-color", p.label); set("text-halo-color", p.halo); } }
    else if (/boundary|aeroway|pier|ice|glacier/.test(id)) hide();
    else if (/water/.test(id)) set(l.type === "fill" ? "fill-color" : "line-color", p.water);
    else if (/park|wood/.test(id)) { set("fill-color", p.park); set("fill-opacity", 1); }
    else if (/residential/.test(id)) set("fill-color", p.land);
    else if (/building/.test(id)) { set("fill-color", p.building); set("fill-outline-color", p.building); }
    else if (/rail/.test(id)) set("line-color", p.rail);
    else if (/casing/.test(id)) set("line-color", p.casing);
    else if (/motorway/.test(id)) set("line-color", p.motorway);
    else if (/major/.test(id)) set("line-color", p.major);
    else if (/minor|path/.test(id)) set("line-color", p.minor);
  }
}

async function main(root: HTMLElement) {
  const [{ candidates }, toilets] = await Promise.all([(await fetch("./candidates.json")).json() as Promise<Dataset>, loadToilets()]);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const presets = windows();
  let win: Preset = presets[0]!, selected: Candidate | null = null;

  const all = candidates.flatMap((c) => c.line);
  const bounds: [LonLat, LonLat] = [
    [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))],
    [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))],
  ];

  const mapEl = root.appendChild($(`<div class="map"></div>`));
  root.append($(`<div class="sky" aria-hidden="true"></div>`));
  const top = root.appendChild($(`<div class="top" role="group" aria-label="When"></div>`));
  const caption = root.appendChild($(`<div class="caption"></div>`));
  const sheet = root.appendChild($(`<section class="sheet" aria-live="polite"></section>`));

  for (const w of presets) {
    const b = top.appendChild($(`<button class="plate" aria-pressed="${w === win}">${w.title}<small>${w.sub}</small></button>`));
    b.onclick = () => {
      win = w;
      top.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      paint();
      if (selected) show(selected);
    };
  }

  const map = new MlMap({
    container: mapEl,
    // Keeps the view in the URL, so a link opens where it was shared from.
    hash: true,
    style: "https://tiles.openfreemap.org/styles/dark",
    bounds,
    fitBoundsOptions: { padding: { top: 110, bottom: 60, left: 30, right: 20 } },
    // The tiles credit OpenFreeMap, OpenMapTiles and OpenStreetMap; these credit the data parkup adds.
    attributionControl: { compact: true, customAttribution: [
      "Kerb data derived from <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\">OpenStreetMap</a>, <a href=\"https://opendatacommons.org/licenses/odbl/\" target=\"_blank\">ODbL</a>",
      "Parking signs and toilets © <a href=\"https://data.brisbane.qld.gov.au\" target=\"_blank\">Brisbane City Council</a>, CC BY 4.0",
      "Toilets from the <a href=\"https://toiletmap.gov.au\" target=\"_blank\">National Public Toilet Map</a>",
      "© State of Queensland, CC BY 4.0",
    ] },
  });

  const features = (of: Candidate[], geometry: (c: Candidate) => Geometry) => ({
    type: "FeatureCollection" as const,
    features: of.map((c) => ({
      type: "Feature" as const, id: c.id, geometry: geometry(c),
      properties: { id: c.id, kind: c.kind, color: UNEVALUATED, opacity: canStay(c, win) ? 1 : 0.2, rank: rank(c) },
    })),
  });
  const kerbs = candidates.filter((c) => c.kind === "kerb");
  const outlines = candidates.filter((c) => c.kind === "parking-area" && c.line.length > 3);
  function paint() {
    const hours = Math.min(win.key === "now" ? NOW_HOURS : MIN_STAY_HOURS, Math.round((+win.to - +win.from) / 3600e3));
    caption.textContent = `Faded: you'd have to move within ${hours} hours`;
    (map.getSource("kerbs") as GeoJSONSource | undefined)?.setData(features(kerbs, (c) => ({ type: "LineString", coordinates: c.line })));
    (map.getSource("outlines") as GeoJSONSource | undefined)?.setData(features(outlines, (c) => ({ type: "Polygon", coordinates: [c.line] })));
    (map.getSource("dots") as GeoJSONSource | undefined)?.setData(features(candidates, (c) => ({ type: "Point", coordinates: anchor(c) })));
    paintToilets(map, toilets, win);
  }

  map.on("load", () => {
    recolour(map);
    addToiletLayer(map);
    map.addSource("kerbs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("dots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const width = ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 10] as ExpressionSpecification;
    map.addLayer({ id: "kerb-glow", type: "line", source: "kerbs", minzoom: STREET_ZOOM - 1, layout: { "line-cap": "round" },
      paint: { "line-color": ["get", "color"], "line-width": 16, "line-blur": 12, "line-opacity": ["*", 0.4, ["get", "opacity"]] } });
    map.addLayer({ id: "kerb-casing", type: "line", source: "kerbs", minzoom: STREET_ZOOM - 1, layout: { "line-cap": "round" },
      paint: { "line-color": "#000", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 5, 18, 14], "line-opacity": ["*", 0.5, ["get", "opacity"]] } });
    map.addLayer({ id: "kerb", type: "line", source: "kerbs", minzoom: STREET_ZOOM - 1, layout: { "line-cap": "round", "line-sort-key": ["get", "rank"] },
      paint: { "line-color": ["get", "color"], "line-width": width, "line-opacity": ["get", "opacity"] } });
    map.addLayer({ id: "kerb-hit", type: "line", source: "kerbs", minzoom: STREET_ZOOM - 1, paint: { "line-color": "#000", "line-width": 28, "line-opacity": 0 } });
    // Car park outlines at street zoom, under everything else.
    map.addSource("outlines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "outline-fill", type: "fill", source: "outlines", minzoom: STREET_ZOOM - 1,
      paint: { "fill-color": ["get", "color"], "fill-opacity": ["*", 0.18, ["get", "opacity"]] } }, "kerb-glow");
    map.addLayer({ id: "outline", type: "line", source: "outlines", minzoom: STREET_ZOOM - 1,
      paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": ["get", "opacity"] } }, "kerb-glow");
    const isKerb = ["==", ["get", "kind"], "kerb"] as ExpressionSpecification;
    const dotPaint = {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, ["+", 2, ["*", 0.5, ["get", "rank"]]], 15, ["+", 3.5, ["get", "rank"]]] as ExpressionSpecification,
      "circle-color": ["get", "color"] as ExpressionSpecification, "circle-opacity": ["get", "opacity"] as ExpressionSpecification,
      "circle-stroke-color": "#111113", "circle-stroke-width": 1.5, "circle-stroke-opacity": ["get", "opacity"] as ExpressionSpecification,
    };
    // Kerbs are dots until street zoom, then lines; sites stay dots, as their outline is too small to tap from afar.
    map.addLayer({ id: "dot", type: "circle", source: "dots", maxzoom: STREET_ZOOM, filter: isKerb, layout: { "circle-sort-key": ["get", "rank"] }, paint: dotPaint });
    map.addLayer({ id: "site-dot", type: "circle", source: "dots", filter: ["!", isKerb], layout: { "circle-sort-key": ["get", "rank"] }, paint: dotPaint });
    // The kind icon: kerbs while they're dots, sites from a little further out.
    for (const kind of ["kerb", "parking-area", "off-road"] as const) map.addImage(`kind-${kind}`, kindIcon(kind), { pixelRatio: 2 });
    const icon = { "icon-image": ["concat", "kind-", ["get", "kind"]] as ExpressionSpecification, "icon-allow-overlap": true, "icon-size": 1, "symbol-sort-key": ["get", "rank"] as ExpressionSpecification };
    map.addLayer({ id: "kerb-icon", type: "symbol", source: "dots", minzoom: 14, maxzoom: STREET_ZOOM, filter: isKerb, layout: icon, paint: { "icon-opacity": ["get", "opacity"] } });
    map.addLayer({ id: "site-icon", type: "symbol", source: "dots", minzoom: 13, filter: ["!", isKerb], layout: icon, paint: { "icon-opacity": ["get", "opacity"] } });
    paint();
  });

  const TAPPABLE = ["kerb-hit", "dot", "site-dot", "kerb-icon", "site-icon", "outline-fill"];
  for (const id of TAPPABLE) {
    map.on("click", id, (e: MapLayerMouseEvent) => { const c = byId.get(String(e.features?.[0]?.properties.id)); if (c) show(c); });
    map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
  }
  map.on("click", (e: MapMouseEvent) => {
    const layers = TAPPABLE.filter((l) => map.getLayer(l));
    if (!map.queryRenderedFeatures(e.point, { layers }).length) { sheet.classList.remove("open"); selected = null; pulse.remove(); }
  });
  // A soft pulsing ring marks the chosen kerb stretch while its card is open.
  const pulse = new Marker({ element: $(`<div class="pulse" aria-hidden="true" style="--c:${UNEVALUATED}"></div>`) });

  // Parking at the start of the window: when do you have to move? Warm if that's before the window ends.
  function outBlock(c: Candidate) {
    const o = outBy(c, win.from);
    if (!o) return `<div class="out"><span class="out-label">Out by</span><strong>No time limit</strong>
      <span class="kv">Nothing on the signs this week</span></div>`;
    return `<div class="out${o.at < win.to ? " warn" : ""}"><span class="out-label">Out by</span>
      <strong>${fmtOut(o.at)}</strong><span class="kv">${esc(o.why)}</span></div>`;
  }

  function show(c: Candidate) {
    selected = c;
    sheet.innerHTML = `<div class="grab"></div><div class="body">
      <div class="tags"><span class="tag" style="--c:${UNEVALUATED}">Not evaluated</span><span class="tag" style="--c:var(--muted)">${KIND_NAMES[c.kind]}</span><span class="tag" style="--c:var(--muted)">${esc(frontage(c))}</span></div>
      <h2>${esc(c.street)}</h2>
      <div class="kv">${esc(meta(c))}</div>
      ${c.dayOnly ? `<div class="day-only">Day only: the signs don't allow a night here</div>` : ""}
      ${outBlock(c)}
      <dl class="facts"><dt>Max stay</dt><dd>${c.maxStayHours ? limitName(c.maxStayHours) : c.kind === "kerb" ? "No limit on the plates" : "No limit mapped"}</dd>${
        c.kind === "kerb" ? "" : `<dt>Tenure</dt><dd>${esc(c.tenure ?? "Unknown")}</dd>`}${toiletFact(c, toilets, win)}</dl>
      <div class="plates">${c.plates.length ? c.plates.map(plate).join("") : `<span class="kv">${c.kind === "kerb" ? "No signs: road rules only" : "No signs mapped here"}</span>`}</div>
      ${c.cautions.length ? `<ul class="cautions">${c.cautions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <p class="check">Check the signs on arrival. No sign isn't permission.</p>
      </div><a class="gmaps" href="${gmaps(c)}" target="_blank" rel="noopener">Open in Google Maps <span aria-hidden="true">↗</span></a>`;
    sheet.classList.add("open");
    pulse.setLngLat(anchor(c)).addTo(map);
    map.easeTo({ center: anchor(c), offset: [0, -170], duration: 600 });
  }
}

main(document.getElementById("app")!);
installBanner(document.getElementById("app")!);
