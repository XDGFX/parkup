// parkup: candidates on a dark map, faded when you can't stay for the chosen window, with a card per kerb stretch.
import { Map as MlMap, Marker, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent } from "maplibre-gl";
import type { Geometry } from "geojson";
// MapLibre finds its worker next to its own module, which bundling breaks, so hand it the bundled worker.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./style.css";
import type { Candidate } from "../build/build.ts";
import { brisbane, canStay, fmtDay, fmtTime, limitName, outBy, windows, type Preset } from "../timetable/timetable.ts";

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

const gmaps = (c: Candidate) => { const [lon, lat] = midpoint(c.line); return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`; };

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
  const { candidates } = (await (await fetch("./candidates.json")).json()) as Dataset;
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
    attributionControl: { compact: true, customAttribution: "Parking signs © Brisbane City Council (CC BY 4.0)" },
  });

  const features = (geometry: (c: Candidate) => Geometry) => ({
    type: "FeatureCollection" as const,
    features: candidates.map((c) => ({
      type: "Feature" as const, id: c.id, geometry: geometry(c),
      properties: { id: c.id, color: UNEVALUATED, opacity: canStay(c, win) ? 1 : 0.2 },
    })),
  });
  function paint() {
    caption.textContent = win.key === "now" ? "Faded: you'd have to move within 3 hours" : "Faded: you'd have to move within 8 hours";
    (map.getSource("kerbs") as GeoJSONSource | undefined)?.setData(features((c) => ({ type: "LineString", coordinates: c.line })));
    (map.getSource("dots") as GeoJSONSource | undefined)?.setData(features((c) => ({ type: "Point", coordinates: midpoint(c.line) })));
  }

  map.on("load", () => {
    recolour(map);
    map.addSource("kerbs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("dots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const width = ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 10] as ExpressionSpecification;
    map.addLayer({ id: "kerb-glow", type: "line", source: "kerbs", minzoom: STREET_ZOOM - 1, layout: { "line-cap": "round" },
      paint: { "line-color": ["get", "color"], "line-width": 16, "line-blur": 12, "line-opacity": ["*", 0.4, ["get", "opacity"]] } });
    map.addLayer({ id: "kerb-casing", type: "line", source: "kerbs", minzoom: STREET_ZOOM - 1, layout: { "line-cap": "round" },
      paint: { "line-color": "#000", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 5, 18, 14], "line-opacity": ["*", 0.5, ["get", "opacity"]] } });
    map.addLayer({ id: "kerb", type: "line", source: "kerbs", minzoom: STREET_ZOOM - 1, layout: { "line-cap": "round" },
      paint: { "line-color": ["get", "color"], "line-width": width, "line-opacity": ["get", "opacity"] } });
    map.addLayer({ id: "kerb-hit", type: "line", source: "kerbs", minzoom: STREET_ZOOM - 1, paint: { "line-color": "#000", "line-width": 28, "line-opacity": 0 } });
    map.addLayer({ id: "dot", type: "circle", source: "dots", maxzoom: STREET_ZOOM, paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 15, 6], "circle-color": ["get", "color"], "circle-opacity": ["get", "opacity"],
      "circle-stroke-color": "#111113", "circle-stroke-width": 1.5, "circle-stroke-opacity": ["get", "opacity"] } });
    paint();
  });

  for (const id of ["kerb-hit", "dot"]) {
    map.on("click", id, (e: MapLayerMouseEvent) => { const c = byId.get(String(e.features?.[0]?.properties.id)); if (c) show(c); });
    map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
  }
  map.on("click", (e: MapMouseEvent) => {
    const layers = ["kerb-hit", "dot"].filter((l) => map.getLayer(l));
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
      <div class="tags"><span class="tag" style="--c:${UNEVALUATED}">Not evaluated</span><span class="tag" style="--c:var(--muted)">Kerb</span></div>
      <h2>${esc(c.street)}</h2>
      <div class="kv">${esc(c.suburb)} · ${c.side} side · ${Math.round(c.lengthM)} m of kerb</div>
      ${c.dayOnly ? `<div class="day-only">Day only: the signs don't allow a night here</div>` : ""}
      ${outBlock(c)}
      <dl class="facts"><dt>Max stay</dt><dd>${c.maxStayHours ? limitName(c.maxStayHours) : "No limit on the plates"}</dd></dl>
      <div class="plates">${c.plates.map(plate).join("")}</div>
      ${c.cautions.length ? `<ul class="cautions">${c.cautions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <p class="check">Check the signs on arrival. No sign isn't permission.</p>
      </div><a class="gmaps" href="${gmaps(c)}" target="_blank" rel="noopener">Open in Google Maps <span aria-hidden="true">↗</span></a>`;
    sheet.classList.add("open");
    pulse.setLngLat(midpoint(c.line)).addTo(map);
    map.easeTo({ center: midpoint(c.line), offset: [0, -170], duration: 600 });
  }
}

main(document.getElementById("app")!);
