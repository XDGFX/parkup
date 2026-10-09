// Context fetch for one candidate: imagery chunks with the kerb drawn on, capture dates, DEM samples, nearby
// council signs, OSM buildings (and which are dwellings), mapped gates on the access, and the nearest waterway.
// Imagery goes in the gitignored cache; context.json is written next to the evaluation and committed.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import { dist, length, offset, project, slice, toLonLat, toXY, type LonLat, type XY } from "../build/geo.ts";
import { DWELLINGS, FETCH } from "./config.ts";
import type { Building, Chunk, Context, DemSample, EsriCapture, Gate, QldCapture } from "./context.ts";

/** What to evaluate: a kerb line, a parking-area outline or a point. */
export type Target = Pick<Context, "id" | "street" | "suburb" | "kind" | "candidate_kind" | "line" | "side" | "osm_tags">;

const UA = { "User-Agent": "parkup-evaluation (https://github.com/XDGFX/parkup)" };
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const QLD = "https://spatial-img.information.qld.gov.au/arcgis/rest/services";
const QLD_AERIAL = `${QLD}/Basemaps/LatestStateProgram_AllUsers/ImageServer`;
const QLD_DEM = `${QLD}/Elevation/QldDem/ImageServer`;
const SIGNS = "https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/parking-sign-locations/records";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
export const CACHE = ".cache/imagery";

// --- HTTP, with retries: the QLD services drop the odd request and Overpass is often busy ---

async function get(url: string, params?: Record<string, string | number>, init?: RequestInit): Promise<Response> {
  const full = params ? `${url}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : url;
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(full, { ...init, headers: { ...UA, ...init?.headers }, signal: AbortSignal.timeout(90_000) });
      if (res.ok) return res;
      last = new Error(`${res.status} from ${url}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw last;
}
const json = async (url: string, params?: Record<string, string | number>) => (await get(url, params)).json() as Promise<any>;

// Overpass allows only a couple of requests at a time per client, so calls queue behind each other.
let overpassQueue: Promise<unknown> = Promise.resolve();
function overpass(query: string): Promise<any[]> {
  const run = overpassQueue.then(() => overpassNow(query));
  overpassQueue = run.catch(() => undefined);
  return run;
}

async function overpassNow(query: string): Promise<any[]> {
  const errors: string[] = [];
  for (const url of OVERPASS) {
    try {
      const res = await get(url, undefined, { method: "POST", body: new URLSearchParams({ data: query }), headers: { Accept: "application/json" } });
      return (await res.json()).elements;
    } catch (e) { errors.push(`${url}: ${e}`); }
  }
  throw new Error(`Overpass failed: ${errors.join(", ")}`);
}

// --- geometry ---

/** Points every `step` metres along the line, with their distance along it, ending on the last vertex. */
function resample(line: XY[], step: number): { p: XY; at: number }[] {
  const total = length(line), out: { p: XY; at: number }[] = [];
  for (let at = 0; at < total; at += step) out.push({ p: slice(line, 0, at).at(-1) ?? line[0]!, at });
  out.push({ p: line.at(-1)!, at: total });
  return out;
}

/** Shortest distance from a point to a line (or to a single point). */
const toLine = (p: XY, line: XY[]) => line.length < 2 ? dist(p, line[0]!) : Math.abs(project(line, p).offset);

const merc = ([lon, lat]: LonLat): XY =>
  [lon * 20037508.34 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI];

// --- sources ---

/** Capture date of the finest Esri imagery at a point, from its metadata layers. */
async function esriCapture([lon, lat]: LonLat): Promise<EsriCapture | null> {
  const layers = await Promise.all(Array.from({ length: 14 }, (_, i) => json(`${ESRI}/${i + 5}/query`, {
    geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: 4326, spatialRel: "esriSpatialRelIntersects",
    outFields: "SRC_DATE,SRC_RES,SRC_DESC,NICE_DESC", returnGeometry: "false", f: "json",
  }).catch(() => ({ features: [] }))));
  let best: any = null;
  for (const l of layers) for (const f of l.features ?? []) {
    const a = f.attributes;
    if (a.SRC_DATE && (!best || a.SRC_RES < best.SRC_RES)) best = a;
  }
  if (!best) return null;
  const d = String(best.SRC_DATE);
  return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, resolution_m: best.SRC_RES, sensor: `${best.NICE_DESC} ${best.SRC_DESC}`.trim() };
}

/** The finest QLD aerial covering a point, with its capture window. */
async function qldCapture([lon, lat]: LonLat): Promise<QldCapture> {
  const r = await json(`${QLD_AERIAL}/identify`, {
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryPoint",
    returnCatalogItems: "true", returnGeometry: "false", f: "json",
  });
  const items = (r.catalogItems?.features ?? []).map((f: any) => f.attributes);
  if (!items.length) throw new Error(`no QLD aerial at ${lon},${lat}`);
  const a = items.reduce((m: any, x: any) => (x.lowps < m.lowps ? x : m));
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { dataset: a.name, start: day(a.capturestart), end: day(a.captureend), resolution_m: a.res_value / 100 };
}

async function dem(points: LonLat[]): Promise<(number | null)[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    // Errors come back as a 200 with an `error` body.
    const r = await json(`${QLD_DEM}/getSamples`, {
      geometry: JSON.stringify({ points, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryMultipoint",
      returnFirstValueOnly: "true", f: "json",
    }).catch((e) => ({ error: String(e) }));
    if (r.samples) {
      const byId = new Map<number, number>(r.samples.filter((s: any) => s.value !== "NoData" && s.value !== "").map((s: any) => [s.locationId, Number(s.value)]));
      return points.map((_, i) => byId.get(i) ?? null);
    }
    await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
  }
  return points.map(() => null);
}

async function signsNear(line: XY[]): Promise<Record<string, unknown>[]> {
  const pad = FETCH.SIGN_M;
  const [w, s] = toLonLat([Math.min(...line.map((p) => p[0])) - pad, Math.min(...line.map((p) => p[1])) - pad]);
  const [e, n] = toLonLat([Math.max(...line.map((p) => p[0])) + pad, Math.max(...line.map((p) => p[1])) + pad]);
  const poly = `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
  const { results } = await json(SIGNS, { where: `within(geo_point_2d, geom'${poly}')`, limit: 100 });
  return (results as any[]).flatMap((r) => {
    const p: LonLat = [r.geo_point_2d.lon, r.geo_point_2d.lat];
    const d = toLine(toXY(p), line);
    return d > FETCH.SIGN_M ? [] : [{
      street: r.street, restriction: r.parkingrestrictiontype, days_times: r.parkingrestrictiondaysandtimes,
      extra_text: r.parkingrestrictiondescription, arrow: r.signdirection, metres_from_kerb_line: Math.round(d * 10) / 10,
      lon: p[0], lat: p[1],
    }];
  });
}

/** OSM buildings, ways, parking and barriers around the candidate, in one Overpass call, cached beside the imagery. */
async function osmAround(id: string, line: XY[], pad: number): Promise<any[]> {
  const [w, s] = toLonLat([Math.min(...line.map((p) => p[0])) - pad, Math.min(...line.map((p) => p[1])) - pad]);
  const [e, n] = toLonLat([Math.max(...line.map((p) => p[0])) + pad, Math.max(...line.map((p) => p[1])) + pad]);
  const bb = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:120];(way[building](${bb});way[highway](${bb});way[waterway](${bb});` +
    `way[amenity=parking](${bb});node[amenity=parking](${bb});node[barrier](${bb}););out body geom;`;
  const cache = `${CACHE}/${id}/osm.json`;
  try {
    const hit = JSON.parse(await readFile(cache, "utf8"));
    if (hit.query === query) return hit.elements;
  } catch { /* not cached */ }
  // The OSM API's map call is the steadier source for a box this small; Overpass is the fallback.
  const elements = await osmApiMap(w, s, e, n).catch(() => overpass(query));
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, JSON.stringify({ query, elements }));
  return elements;
}

/** Everything in a small box from the OSM API, reshaped like Overpass `out body geom` and cut to what the context uses. */
async function osmApiMap(w: number, s: number, e: number, n: number): Promise<any[]> {
  const { elements } = await json(`https://api.openstreetmap.org/api/0.6/map.json`, { bbox: `${w},${s},${e},${n}` });
  const nodes = new Map<number, any>(elements.filter((x: any) => x.type === "node").map((x: any) => [x.id, x]));
  const wanted = (t: any) => t && (t.building || t.highway || t.waterway || t.amenity === "parking" || t.barrier);
  return elements.filter((x: any) => x.type !== "relation" && wanted(x.tags)).map((x: any) => x.type === "node" ? x : {
    ...x, geometry: x.nodes.map((id: number) => { const nd = nodes.get(id); return nd ? { lon: nd.lon, lat: nd.lat } : null; }),
  }).filter((x: any) => x.type === "node" || x.geometry.every(Boolean));
}

/** Mapped service roads and tracks within 100 m of a point: where a van could actually get to. */
function waysNear(line: XY[], els: any[]): Context["mapped_ways"] {
  const out: NonNullable<Context["mapped_ways"]> = [];
  for (const e of els) {
    if (e.type !== "way" || !/^(service|track|unclassified)$/.test(e.tags?.highway ?? "") || !e.geometry) continue;
    const d = Math.min(...line.map((p) => toLine(p, e.geometry.map((g: any) => toXY([g.lon, g.lat])))));
    if (d > FETCH.BUILDING_POINT_M) continue;
    out.push({ highway: e.tags.highway, service: e.tags.service ?? null, name: e.tags.name ?? null, surface: e.tags.surface ?? null, access: e.tags.access ?? null, metres: Math.round(d) });
  }
  return out.sort((a, b) => a.metres - b.metres).slice(0, 8);
}

/** Mapped car parks near the candidate, so a hand-dropped pin next to one isn't judged on the wrong patch of ground. */
function parkingNear(line: XY[], els: any[]): Context["mapped_parking"] {
  const out: NonNullable<Context["mapped_parking"]> = [];
  for (const e of els) {
    if (e.tags?.amenity !== "parking") continue;
    const pts: XY[] = e.type === "node" ? [toXY([e.lon, e.lat])] : (e.geometry ?? []).map((g: any) => toXY([g.lon, g.lat]));
    if (!pts.length) continue;
    const d = Math.min(...line.map((p) => toLine(p, pts)));
    if (d > FETCH.BUILDING_POINT_M) continue;
    out.push({ name: e.tags.name ?? null, metres: Math.round(d), access: e.tags.access ?? null, fee: e.tags.fee ?? null, surface: e.tags.surface ?? null });
  }
  return out.sort((a, b) => a.metres - b.metres).slice(0, 5);
}

const PUBLIC = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$/;
const VEHICLE = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|road)(_link)?$/;
const GATE = new Set(["gate", "lift_gate", "bollard", "swing_gate", "chain", "barrier_board"]);

/**
 * Gates on the access: mapped barriers within reach, and whether every mapped vehicle way from the candidate to a
 * public road passes one. A kerb is on a public road, so it's never gated. A candidate with no mapped way to a
 * public road isn't either: there's nothing to say it's gated.
 */
function gatesOn(target: Target, line: XY[], els: any[]): Gate[] {
  const barriers = els.filter((e) => e.type === "node" && GATE.has(e.tags?.barrier) && e.tags?.locked !== "no" && e.tags?.access !== "yes");
  const near = barriers.map((b) => ({ b, d: toLine(toXY([b.lon, b.lat]), line) })).filter(({ d }) => d <= FETCH.ACCESS_M);
  if (!near.length) return [];
  const onlyAccess = target.kind === "kerb" ? new Set<number>() : gatedBy(line, els, new Set(barriers.map((b) => b.id)));
  return near.sort((a, z) => a.d - z.d).slice(0, 10).map(({ b, d }) => ({
    barrier: b.tags.barrier, locked: b.tags.locked ?? null, lon: b.lon, lat: b.lat, metres: Math.round(d), on_only_access: onlyAccess.has(b.id),
  }));
}

/** The barrier nodes that block every route from the candidate to a public road; empty if any route is open. */
function gatedBy(line: XY[], els: any[], barriers: Set<number>): Set<number> {
  const ways = els.filter((e) => e.type === "way" && VEHICLE.test(e.tags?.highway ?? ""));
  const pos = new Map<number, XY>(), next = new Map<number, Set<number>>(), publicNodes = new Set<number>();
  for (const w of ways) {
    w.nodes.forEach((id: number, i: number) => {
      const g = w.geometry[i];
      if (g) pos.set(id, toXY([g.lon, g.lat]));
      if (PUBLIC.test(w.tags.highway) && !/^(private|no)$/.test(w.tags.access ?? "")) publicNodes.add(id);
      if (i) {
        const a = w.nodes[i - 1];
        if (!next.has(a)) next.set(a, new Set());
        if (!next.has(id)) next.set(id, new Set());
        next.get(a)!.add(id); next.get(id)!.add(a);
      }
    });
  }
  // Start from the vehicle-way nodes at the candidate: within 30 m of a point, or 10 m of an outline.
  const reach = line.length < 2 ? 30 : 10;
  const start = [...pos].filter(([id, p]) => !barriers.has(id) && toLine(p, line) <= reach).map(([id]) => id);
  if (!start.length || start.some((id) => publicNodes.has(id))) return new Set();
  const search = (blocked: boolean) => {
    const seen = new Set(start), queue = [...start], hit = new Set<number>();
    while (queue.length) {
      const n = queue.shift()!;
      if (publicNodes.has(n)) return { reached: true, hit };
      for (const m of next.get(n) ?? []) {
        if (seen.has(m)) continue;
        seen.add(m);
        if (barriers.has(m)) { hit.add(m); if (blocked) continue; }
        queue.push(m);
      }
    }
    return { reached: false, hit };
  };
  if (search(true).reached) return new Set();
  const open = search(false);
  return open.reached ? open.hit : new Set();
}

function buildingsNear(target: Target, line: XY[], els: any[]): Building[] {
  const radius = target.kind === "point" ? FETCH.BUILDING_POINT_M : FETCH.BUILDING_M;
  const out: Building[] = [];
  for (const e of els) {
    if (e.type !== "way" || !e.tags?.building || !e.geometry) continue;
    const outline: LonLat[] = e.geometry.map((g: any) => [g.lon, g.lat]);
    const pts = outline.map(toXY);
    let best = { d: Infinity, at: 0 };
    for (const p of pts) {
      const d = toLine(p, line);
      if (d < best.d) best = { d, at: line.length < 2 ? 0 : project(line, p).along };
    }
    if (best.d > radius) continue;
    const tag = e.tags.building === "yes" && e.tags["building:use"] ? e.tags["building:use"] : e.tags.building;
    out.push({ building: e.tags.building, name: e.tags.name ?? null, dwelling: DWELLINGS.has(tag), metres: Math.round(best.d), at_m: Math.round(best.at), outline });
  }
  return out.sort((a, b) => a.metres - b.metres).slice(0, 25);
}

function waterwayNear(line: XY[], els: any[]): Context["waterway"] {
  let best: Context["waterway"] = null;
  for (const e of els) {
    if (e.type !== "way" || !e.tags?.waterway || !e.geometry) continue;
    const w = e.geometry.map((g: any) => toXY([g.lon, g.lat]));
    const d = Math.min(...line.map((p) => toLine(p, w)));
    if (!best || d < best.metres) best = { name: e.tags.name ?? null, metres: Math.round(d) };
  }
  return best;
}

// --- imagery ---

/** Esri World Imagery export, keyless. Returns null if Esri refuses, so the QLD aerial stands alone. */
async function esriImage(bbox: number[], size: [number, number]): Promise<Buffer | null> {
  try {
    const res = await get(`${ESRI}/export`, { bbox: bbox.join(","), bboxSR: 3857, imageSR: 3857, size: size.join(","), format: "jpg", f: "image" });
    if (!res.headers.get("content-type")?.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

async function qldImage(bbox: number[], size: [number, number]): Promise<Buffer> {
  const res = await get(`${QLD_AERIAL}/exportImage`, {
    bbox: bbox.join(","), bboxSR: 3857, imageSR: 3857, size: size.join(","), format: "jpg", f: "image", interpolation: "RSP_BilinearInterpolation",
  });
  return Buffer.from(await res.arrayBuffer());
}

/**
 * The overlay: the kerb or outline in yellow with a ring at its start (or just a ring on a point), a tick every 10 m
 * along it with the distance from the start every 50 m, and council signs as small cyan dots.
 */
function overlay(bbox: number[], size: [number, number], target: Target, line: XY[], from: number, to: number, signs: LonLat[]): Buffer {
  const [x0, y0, x1, y1] = bbox as [number, number, number, number], [w, h] = size;
  const px = (p: XY) => { const [mx, my] = merc(toLonLat(p)); return [(mx - x0) / (x1 - x0) * w, (y1 - my) / (y1 - y0) * h] as const; };
  const parts: string[] = [];
  if (target.kind === "point") {
    const [cx, cy] = px(line[0]!);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="#ffdc00" stroke-width="3"/>`);
  } else {
    const piece = slice(line, from, to);
    parts.push(`<polyline points="${piece.map((p) => px(p).join(",")).join(" ")}" fill="none" stroke="#ffdc00" stroke-width="3"/>`);
    const [sx, sy] = px(line[0]!);
    parts.push(`<circle cx="${sx}" cy="${sy}" r="6" fill="none" stroke="#ffdc00" stroke-width="3"/>`);
    for (let at = Math.ceil(from / 10) * 10; at <= to; at += 10) {
      const p = slice(line, 0, at).at(-1) ?? line[0]!, [tx, ty] = px(p);
      parts.push(`<circle cx="${tx}" cy="${ty}" r="${at % 50 ? 2.5 : 4}" fill="#ffdc00"/>`);
      if (at % 50 === 0) parts.push(`<text x="${tx + 7}" y="${ty - 7}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#ffdc00" stroke="#000" stroke-width="3" paint-order="stroke">${at} m</text>`);
    }
  }
  for (const s of signs) { const [cx, cy] = px(toXY(s)); parts.push(`<circle cx="${cx}" cy="${cy}" r="4" fill="#00e6ff"/>`); }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join("")}</svg>`);
}

const exists = (path: string) => stat(path).then(() => true, () => false);

async function chunkImages(target: Target, line: XY[], signs: LonLat[], chunk: number, from: number, to: number, box: XY[]): Promise<Chunk> {
  const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]), pad = target.kind === "point" ? 0 : FETCH.PAD_M;
  const sw = toLonLat([Math.min(...xs) - pad, Math.min(...ys) - pad]), ne = toLonLat([Math.max(...xs) + pad, Math.max(...ys) + pad]);
  const lo = merc(sw), hi = merc(ne), bbox = [lo[0], lo[1], hi[0], hi[1]];
  const ground: [number, number] = [Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
  const size: [number, number] = [
    Math.min(FETCH.MAX_PX, Math.round(ground[0] / FETCH.M_PER_PX)), Math.min(FETCH.MAX_PX, Math.round(ground[1] / FETCH.M_PER_PX)),
  ];
  const mid = toLonLat(box[Math.floor(box.length / 2)]!);
  const dir = `${CACHE}/${target.id}`;
  await mkdir(dir, { recursive: true });
  const names = { esri: `${dir}/chunk${chunk}-esri.jpg`, qld: `${dir}/chunk${chunk}-qld.jpg` };
  const svg = overlay(bbox, size, target, line, from, to, signs);
  const draw = async (img: Buffer, path: string) =>
    sharp(img).resize(size[0], size[1], { fit: "fill" }).composite([{ input: svg }]).jpeg({ quality: 88 }).toFile(path);
  let esriOk = await exists(names.esri);
  if (!esriOk) {
    const img = await esriImage(bbox, size);
    if (img) { await draw(img, names.esri); esriOk = true; }
  }
  if (!(await exists(names.qld))) await draw(await qldImage(bbox, size), names.qld);
  const [esriCap, qldCap] = await Promise.all([esriOk ? esriCapture(mid) : Promise.resolve(null), qldCapture(mid)]);
  return {
    chunk, from_m: Math.round(from), to_m: Math.round(to), length_m: Math.round(to - from),
    images: { esri: esriOk ? names.esri : null, qld: names.qld },
    esri_capture: esriCap, qld_capture: qldCap,
    ground_size_m: [Math.round(ground[0]), Math.round(ground[1])], image_px: size,
  };
}

// --- the context ---

export async function fetchContext(target: Target, outFile: string): Promise<Context> {
  const line = target.line.map(toXY);
  const total = line.length < 2 ? 0 : length(line);
  const [signs, els] = await Promise.all([
    target.kind === "kerb" ? signsNear(line) : signsNear(line.length < 2 ? [line[0]!, line[0]!] : line).catch(() => []),
    osmAround(target.id, line, FETCH.ACCESS_M),
  ]);

  // DEM: every 5 m along the line; for a point, along an east–west and a north–south line through it.
  const lines: { pts: { p: XY; at: number }[] }[] = [];
  if (target.kind === "point") {
    const [x, y] = line[0]!, r = FETCH.POINT_SLOPE_M;
    lines.push({ pts: resample([[x - r, y], [x + r, y]], FETCH.DEM_STEP_M) }, { pts: resample([[x, y - r], [x, y + r]], FETCH.DEM_STEP_M) });
  } else lines.push({ pts: resample(line, FETCH.DEM_STEP_M) });
  const flat = lines.flatMap((l, i) => l.pts.map((s) => ({ ...s, line: i })));
  const elev = await dem(flat.map((s) => toLonLat(s.p)));
  const samples: DemSample[] = flat.map((s, i) => {
    const [lon, lat] = toLonLat(s.p);
    return { lon, lat, at_m: Math.round(s.at * 10) / 10, line: s.line, elevation_m: elev[i] == null ? null : Math.round(elev[i]! * 100) / 100 };
  });
  const grades: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!, b = samples[i]!;
    if (a.line === b.line && a.elevation_m !== null && b.elevation_m !== null && b.at_m > a.at_m)
      grades.push(Math.abs(b.elevation_m - a.elevation_m) / (b.at_m - a.at_m) * 100);
  }
  const valid = samples.flatMap((s) => s.elevation_m === null ? [] : [s.elevation_m]);
  const r1 = (v: number) => Math.round(v * 10) / 10;

  // Imagery: chunks of up to 150 m along a line, or one 100 m box around a point.
  const signPts = signs.map((s) => [s.lon, s.lat] as LonLat);
  const chunks: Chunk[] = [];
  if (target.kind === "point") {
    const [x, y] = line[0]!, r = FETCH.POINT_BOX_M;
    chunks.push(await chunkImages(target, line, signPts, 1, 0, 0, [[x - r, y - r], [x + r, y + r]]));
  } else {
    const n = Math.max(1, Math.ceil(total / FETCH.CHUNK_M));
    for (let i = 0; i < n; i++) {
      const from = total * i / n, to = total * (i + 1) / n;
      chunks.push(await chunkImages(target, line, signPts, i + 1, from, to, slice(line, from, to)));
    }
  }

  const context: Context = {
    ...target,
    length_m: Math.round(total),
    signs: signs.map(({ lon: _, lat: __, ...s }) => s),
    buildings: buildingsNear(target, line, els),
    gates: gatesOn(target, line, els),
    slope: {
      step_m: FETCH.DEM_STEP_M, samples,
      min_elevation_m: valid.length ? r1(Math.min(...valid)) : null,
      max_elevation_m: valid.length ? r1(Math.max(...valid)) : null,
      mean_grade_pct: grades.length ? r1(grades.reduce((a, b) => a + b, 0) / grades.length) : null,
      max_grade_pct: grades.length ? r1(Math.max(...grades)) : null,
    },
    waterway: waterwayNear(line, els),
    mapped_parking: parkingNear(line, els),
    ...(target.kind === "point" ? { mapped_ways: waysNear(line, els) } : {}),
    chunks,
  };
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(context, null, 2) + "\n");
  return context;
}

// --- targets ---

/** A calibration known place: a kerb beside an OSM way chain (side 1 left, -1 right, of the chain's direction), the outline of an area (side 0), or a pin. */
export type KnownPlace = { id: string; street: string; suburb: string; ways?: number[]; side?: number; point?: LonLat; note?: string; known: string };

export async function knownPlaceTarget(place: KnownPlace, halfWidth: Record<string, number>): Promise<Target> {
  if (place.point) return { id: place.id, street: place.street, suburb: place.suburb, kind: "point", line: [place.point], osm_tags: {} };
  const ways = await Promise.all(place.ways!.map(async (id) => {
    const { elements } = await json(`https://api.openstreetmap.org/api/0.6/way/${id}/full.json`);
    const nodes = new Map<number, LonLat>(elements.filter((e: any) => e.type === "node").map((e: any) => [e.id, [e.lon, e.lat]]));
    const way = elements.find((e: any) => e.type === "way");
    return { coords: way.nodes.map((n: number) => nodes.get(n)!) as LonLat[], tags: way.tags ?? {} as Record<string, string> };
  }));
  const centre = join(ways.map((w) => w.coords));
  const tags = Object.assign({}, ...ways.map((w) => w.tags)) as Record<string, string>;
  const osmTags = Object.fromEntries(Object.entries(tags).filter(([k]) =>
    ["highway", "maxspeed", "oneway", "lanes", "lit", "surface", "width", "sidewalk", "amenity", "access", "fee"].includes(k) || k.startsWith("parking")));
  if (!place.side) return { id: place.id, street: place.street, suburb: place.suburb, kind: "outline", line: centre, side: "outline", osm_tags: osmTags };
  const d = (halfWidth[tags.highway ?? ""] ?? 5) * place.side;
  const kerb = offset(centre.map(toXY), d).map(toLonLat);
  return { id: place.id, street: place.street, suburb: place.suburb, kind: "kerb", line: kerb, side: place.side > 0 ? "left" : "right", osm_tags: osmTags };
}

/** Chain ways into one line, flipping any that run backwards. */
function join(ways: LonLat[][]): LonLat[] {
  const same = (a: LonLat, b: LonLat) => a[0] === b[0] && a[1] === b[1];
  let line = [...ways[0]!];
  for (let w of ways.slice(1)) {
    if (same(w.at(-1)!, line.at(-1)!) || same(w.at(-1)!, line[0]!)) w = [...w].reverse();
    if (same(w[0]!, line[0]!)) line = line.reverse();
    line = same(w[0]!, line.at(-1)!) ? [...line, ...w.slice(1)] : [...line, ...w];
  }
  return line;
}
