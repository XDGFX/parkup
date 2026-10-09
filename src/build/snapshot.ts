// Fetches and pins the build's inputs for the three suburbs: BCC parking signs, yellow lines, the St Lucia Traffic Area
// and City Plan zoning, and OSM road centrelines and points (signals, crossings, bus stops, schools and kindergartens).
// Then the site layers: OSM car parks, tracks and barriers, BCC Tracks and Trails, QLD Roads and Tracks, BCC Council
// Vegetation, and a QLD cadastre query at each site.
// Run: npm run snapshot (add -- --sites for the site layers alone). Writes data/snapshot/*.json, which are committed so a rebuild is repeatable.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { TRAILS } from "./config.ts";
import type { LonLat } from "./geo.ts";
import type {
  CouncilLand, KerbLine, OsmArea, OsmNode, OsmWay, Parcel, PermitArea, QldTrack, SignRecord, Snapshot, ToiletRecord, TrailLine, Zone,
} from "./inputs.ts";
import { buildSites } from "./sites.ts";

const BCC = "https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const SUBURBS = ["TARINGA", "INDOOROOPILLY", "ST LUCIA"];
// OSM admin_level=9 relations for Indooroopilly, St Lucia and Taringa.
const SUBURB_RELATIONS = [11677824, 11677827, 11677828];
const HIGHWAYS = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street";

async function signs(): Promise<SignRecord[]> {
  const where = SUBURBS.map((s) => `suburb="${s}"`).join(" or ");
  const url = `${BCC}/parking-sign-locations/exports/json?where=${encodeURIComponent(where)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BCC signs: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Record<string, any>[];
  return rows
    .map((r) => ({
      assetid: r.assetid,
      street: r.street,
      suburb: r.suburb,
      lon: r.geo_point_2d.lon,
      lat: r.geo_point_2d.lat,
      signdirection: r.signdirection,
      bccallocationcode: r.bccallocationcode,
      multisignsegment: r.multisignsegment,
      parkingrestrictiontype: r.parkingrestrictiontype,
      parkingrestrictiondaysandtimes: r.parkingrestrictiondaysandtimes,
      parkingrestrictiondescription: r.parkingrestrictiondescription,
    }))
    .sort((a, b) => a.assetid.localeCompare(b.assetid));
}

// The main Overpass server is often busy (504 or 429), so fall back to a mirror, and try both a few times.
// Both refuse requests without a User-Agent.
async function overpass(query: string): Promise<unknown> {
  const errors: string[] = [];
  for (let attempt = 0; attempt < 4; attempt++) for (const url of OVERPASS) {
    if (attempt) await new Promise((r) => setTimeout(r, 20e3 * attempt));
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": "parkup-snapshot (https://github.com/XDGFX/parkup)", Accept: "application/json" },
      body: new URLSearchParams({ data: query }),
    }).catch((e: Error) => e);
    if (res instanceof Error) { errors.push(`${url}: ${res.message}`); continue; }
    // A busy server (or a mirror without the suburb areas) can answer 200 with no elements.
    const body = res.ok ? ((await res.json()) as { remark?: string; elements?: unknown[] }) : null;
    if (body?.elements?.length && !/error/i.test(body.remark ?? "")) return body;
    errors.push(`${url}: ${res.status} ${body?.remark ?? ""}`);
  }
  throw new Error(`Overpass failed: ${errors.join(", ")}`);
}

async function ways(): Promise<OsmWay[]> {
  const query = `[out:json][timeout:180];
(${SUBURB_RELATIONS.map((id) => `rel(${id});`).join("")})->.subs;
.subs map_to_area->.a;
way(area.a)[highway~"^(${HIGHWAYS})(_link)?$"];
out body geom;`;
  const { elements } = (await overpass(query)) as { elements: any[] };
  return elements
    .map((e) => ({
      id: e.id,
      tags: e.tags ?? {},
      nodes: e.nodes,
      coords: e.geometry.map((g: { lon: number; lat: number }) => [g.lon, g.lat] as [number, number]),
    }))
    .sort((a, b) => a.id - b.id);
}

/** Traffic signals, crossings and bus stops, and schools and kindergartens as their centre point. */
async function nodes(): Promise<OsmNode[]> {
  // By bounding box rather than suburb area: quicker on busy servers, and it catches signals just over the boundary.
  const query = `[out:json][timeout:180][bbox:-27.53,152.94,-27.475,153.03];
(node[highway~"^(traffic_signals|crossing|bus_stop)$"];
 nwr[amenity~"^(school|kindergarten|childcare)$"];);
out tags center;`;
  const { elements } = (await overpass(query)) as { elements: any[] };
  return elements
    .map((e) => ({ id: e.id, lon: e.lon ?? e.center.lon, lat: e.lat ?? e.center.lat, tags: e.tags ?? {} }))
    .sort((a, b) => a.id - b.id);
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const pt = ([lon, lat]: number[]): [number, number] => [round6(lon!), round6(lat!)];
/** A BCC geo_shape (a GeoJSON Feature or geometry) as lists of lines, or of polygons' rings. */
const geometry = (g: any) => g.geometry ?? g;
const linesOf = (g: any): [number, number][][] => {
  const { type, coordinates } = geometry(g);
  return (type === "LineString" ? [coordinates] : coordinates).map((l: number[][]) => l.map(pt));
};
const polygonsOf = (g: any): [number, number][][][] => {
  const { type, coordinates } = geometry(g);
  return (type === "Polygon" ? [coordinates] : coordinates).map((p: number[][][]) => p.map((r) => r.map(pt)));
};

async function bcc(dataset: string, where: string): Promise<Record<string, any>[]> {
  const res = await fetch(`${BCC}/${dataset}/exports/json?where=${encodeURIComponent(where)}`);
  if (!res.ok) throw new Error(`BCC ${dataset}: ${res.status} ${await res.text()}`);
  return (await res.json()) as Record<string, any>[];
}

/** Yellow no-stopping lines at the kerb. */
async function lines(): Promise<KerbLine[]> {
  const rows = await bcc("parking-line-locations", `(${SUBURBS.map((s) => `suburb="${s}"`).join(" or ")}) and pavementmarkingsubtype="No Stopping Line"`);
  return rows.flatMap((r) => linesOf(r.geo_shape).map((coords, i) => ({ assetid: i ? `${r.assetid}-${i}` : r.assetid, coords })))
    .sort((a, b) => a.assetid.localeCompare(b.assetid));
}

/** The St Lucia Traffic Area polygon. Its rules aren't in the data; see ST_LUCIA_TRAFFIC_AREA in config.ts. */
async function areas(): Promise<PermitArea[]> {
  const rows = await bcc("parking-regulated-permit-parking-areas", `description="ST LUCIA TRAFFIC AREA"`);
  return rows.flatMap((r) => polygonsOf(r.geo_shape).map((rings) => ({ name: r.description, rings })));
}

// The three suburbs' extent, with a margin so kerbs on the edge still find their frontage.
const BBOX = "POLYGON((152.94 -27.53, 153.03 -27.53, 153.03 -27.475, 152.94 -27.475, 152.94 -27.53))";

/** City Plan 2014 zones touching the suburbs. The code is the precinct where there is one ("CF5 - Education purpose" → "CF5"). */
async function zones(): Promise<Zone[]> {
  const rows = await bcc("cp14-zoning-overlay", `intersects(geo_shape, geom'${BBOX}')`);
  return rows
    .flatMap((r) => {
      const [code, name] = /^([A-Z]+\d*) - (.+)$/.exec(r.zone_prec_desc ?? "")?.slice(1) ?? [r.zone_code, r.lvl2_zone];
      return polygonsOf(r.geo_shape).map((rings) => ({ id: r.objectid as string, code: code as string, name: name as string, rings }));
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map(({ id: _, ...z }) => z);
}

// BCC's copy of the National Public Toilet Map, for all of Brisbane: it's small, and the build keeps the nearby ones.
async function toilets(): Promise<ToiletRecord[]> {
  const res = await fetch(`${BCC}/public-toilets-in-brisbane/exports/json`);
  if (!res.ok) throw new Error(`BCC toilets: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Record<string, any>[];
  return rows
    .map((r) => ({
      facilityid: String(r.facilityid),
      name: r.name,
      facilitytype: r.facilitytype,
      address: r.address1,
      lon: r.longitude,
      lat: r.latitude,
      openinghours: r.openinghours,
    }))
    .sort((a, b) => a.facilityid.localeCompare(b.facilityid));
}

const OSM_BBOX = "-27.53,152.94,-27.475,153.03";

/** Car parks, tracks and service roads (with their barriers), as of the same Overpass query. */
async function osmSites(): Promise<{ parkings: OsmArea[]; minorWays: OsmWay[]; barriers: OsmNode[] }> {
  const query = `[out:json][timeout:180][bbox:${OSM_BBOX}];
way[highway~"^(track|service)$"]->.minor;
nwr[amenity=parking];
out body geom;
.minor out body geom;
node(w.minor)[barrier];
out body;`;
  const { elements } = (await overpass(query)) as { elements: any[] };
  const ring = (g: { lon: number; lat: number }[]) => g.map((p) => pt([p.lon, p.lat]));
  const closed = (r: [number, number][]) => r.length > 3 && r[0]![0] === r.at(-1)![0] && r[0]![1] === r.at(-1)![1];
  const parkings: OsmArea[] = [], minorWays: OsmWay[] = [], barriers: OsmNode[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    if (tags.amenity === "parking") {
      if (e.type === "node") parkings.push({ type: "node", id: e.id, tags, rings: null, lon: round6(e.lon), lat: round6(e.lat) });
      else if (e.type === "way") parkings.push({ type: "way", id: e.id, tags, rings: [ring(e.geometry)] });
      else {
        const rings = (e.members ?? []).filter((m: any) => m.role === "outer" && m.geometry).map((m: any) => ring(m.geometry)).filter(closed);
        if (rings.length) parkings.push({ type: "relation", id: e.id, tags, rings });
      }
    } else if (e.type === "way") minorWays.push({ id: e.id, tags, nodes: e.nodes, coords: ring(e.geometry) });
    else if (e.type === "node" && tags.barrier) barriers.push({ id: e.id, lon: round6(e.lon), lat: round6(e.lat), tags });
  }
  const byId = <T extends { id: number }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()].sort((a, b) => a.id - b.id);
  return { parkings: byId(parkings), minorWays: byId(minorWays), barriers: byId(barriers) };
}

/** BCC Park — Tracks and Trails access lines in the three suburbs' extent. */
async function trails(): Promise<TrailLine[]> {
  const types = TRAILS.ITEM_TYPES.map((t) => `item_type="${t}"`).join(" or ");
  const rows = await bcc("tracks-and-trails", `(${types}) and intersects(geo_shape, geom'${BBOX}')`);
  return rows
    .flatMap((r) => linesOf(r.geo_shape).map((coords, i) => ({
      id: i ? `${r.objectid}-${i}` : String(r.objectid), itemType: r.item_type, park: r.park_name ?? null, description: r.item_description ?? null, coords,
    })))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** BCC Council Vegetation: land the council owns or controls, which the cadastre shows as freehold. */
async function councilLand(): Promise<CouncilLand[]> {
  const rows = await bcc("protected-vegetation-natural-assets-local-law-2003-council-vegetation", `intersects(geo_shape, geom'${BBOX}')`);
  return rows
    .sort((a, b) => String(a.objectid).localeCompare(String(b.objectid), undefined, { numeric: true }))
    .flatMap((r) => polygonsOf(r.geo_shape).map((rings) => ({ rings })));
}

const QLD = "https://spatial-gis.information.qld.gov.au/arcgis/rest/services";
async function arcgis(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`${QLD}/${path}/query?${new URLSearchParams({ f: "json", inSR: "4326", outSR: "4326", ...params })}`);
  if (!res.ok) throw new Error(`QLD ${path}: ${res.status} ${await res.text()}`);
  const body = await res.json() as any;
  if (body.error) throw new Error(`QLD ${path}: ${JSON.stringify(body.error)}`);
  return body;
}

/** QLD Roads and Tracks: tracks in the three suburbs' extent, for their trafficability. */
async function qldTracks(): Promise<QldTrack[]> {
  const body = await arcgis("Transportation/RoadsAndTracks/MapServer/10", {
    where: "class='Track'", geometry: "152.94,-27.53,153.03,-27.475", geometryType: "esriGeometryEnvelope",
    outFields: "segment_id,trafficability,surface_type", returnGeometry: "true",
  });
  return (body.features as any[])
    .sort((a, b) => String(a.attributes.segment_id).localeCompare(String(b.attributes.segment_id)))
    .flatMap((f) => (f.geometry.paths as number[][][]).map((p) => ({
      trafficability: f.attributes.trafficability ?? null, surface: f.attributes.surface_type ?? null, coords: p.map(pt),
    })));
}

/** One QLD cadastre point query per site, at the site's point as the build places it. */
async function parcels(points: LonLat[]): Promise<Parcel[]> {
  const out: Parcel[] = [];
  const queue = [...new Map(points.map((p) => [p.join(","), p])).values()];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const body = await arcgis("PlanningCadastre/LandParcelPropertyFramework/MapServer/4", {
        geometry: `${p[0]},${p[1]}`, geometryType: "esriGeometryPoint", outFields: "lotplan,tenure,parcel_typ", returnGeometry: "false",
      });
      const a = body.features?.[0]?.attributes;
      out.push({ lon: p[0], lat: p[1], lotplan: a?.lotplan ?? null, tenure: a?.tenure ?? null, parcelType: a?.parcel_typ ?? null });
    }
  }));
  return out.sort((a, b) => a.lon - b.lon || a.lat - b.lat);
}

const save = (name: string, takenAt: string, data: Record<string, unknown>) =>
  writeFile(`data/snapshot/${name}.json`, JSON.stringify({ takenAt, ...data }, null, 0));
const load = async (name: string) => JSON.parse(await readFile(`data/snapshot/${name}.json`, "utf8"));

/** The site layers, then the tenure of each site the build would make from them and the rest of the snapshot. */
async function snapshotSites(takenAt: string) {
  const osm = await osmSites();
  const [tr, q, c] = await Promise.all([trails(), qldTracks(), councilLand()]);
  await save("sites", takenAt, { ...osm, trails: tr, qldTracks: q, councilLand: c });
  const [base, signSnapshot] = await Promise.all([load("osm"), load("signs")]);
  const points = buildSites({ ways: base.ways, nodes: [...base.nodes, ...osm.barriers], signs: signSnapshot.signs, ...osm, trails: tr }).map((s) => s.point);
  const p = await parcels(points);
  await save("tenure", takenAt, { parcels: p });
  console.log(`sites snapshot: ${osm.parkings.length} car parks, ${osm.minorWays.length} tracks and service roads, ${osm.barriers.length} barriers, ` +
    `${tr.length} BCC access lines, ${q.length} QLD tracks, ${c.length} council land polygons, ${p.length} cadastre queries`);
}

await mkdir("data/snapshot", { recursive: true });
// `--sites` refreshes only the site layers and tenure, against the rest of the snapshot as it stands.
if (process.argv.includes("--sites")) {
  await snapshotSites(new Date().toISOString());
  process.exit(0);
}

// Overpass allows few concurrent requests, so the OSM queries go one after the other.
const [s, l, a, z, t] = await Promise.all([signs(), lines(), areas(), zones(), toilets()]);
const w = await ways(), n = await nodes();
const snapshot: Snapshot = { takenAt: new Date().toISOString(), signs: s, ways: w, nodes: n, lines: l, areas: a, zones: z };
await mkdir("data/snapshot", { recursive: true });
await writeFile("data/snapshot/signs.json", JSON.stringify({ takenAt: snapshot.takenAt, signs: s }, null, 0));
await writeFile("data/snapshot/osm.json", JSON.stringify({ takenAt: snapshot.takenAt, ways: w, nodes: n }, null, 0));
await writeFile("data/snapshot/lines.json", JSON.stringify({ takenAt: snapshot.takenAt, lines: l }, null, 0));
await writeFile("data/snapshot/areas.json", JSON.stringify({ takenAt: snapshot.takenAt, areas: a }, null, 0));
await writeFile("data/snapshot/zones.json", JSON.stringify({ takenAt: snapshot.takenAt, zones: z }, null, 0));
await writeFile("data/snapshot/toilets.json", JSON.stringify({ takenAt: snapshot.takenAt, toilets: t }, null, 0));
console.log(`snapshot: ${s.length} sign plates, ${w.length} OSM ways, ${n.length} OSM points, ${l.length} yellow lines, ` +
  `${a.length} traffic-area polygons, ${z.length} zone polygons, ${t.length} toilets`);
await snapshotSites(snapshot.takenAt);
