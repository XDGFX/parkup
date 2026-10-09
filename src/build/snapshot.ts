// Fetches and pins the build's inputs for the three suburbs: BCC parking signs, yellow lines, the St Lucia Traffic Area
// and City Plan zoning, and OSM road centrelines and points (signals, crossings, bus stops, schools and kindergartens).
// Run: npm run snapshot. Writes data/snapshot/*.json, which are committed so a rebuild is repeatable.
import { mkdir, writeFile } from "node:fs/promises";
import type { KerbLine, OsmNode, OsmWay, PermitArea, SignRecord, Snapshot, ToiletRecord, Zone } from "./inputs.ts";

const BCC = "https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
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
  const query = `[out:json][timeout:180];
(${SUBURB_RELATIONS.map((id) => `rel(${id});`).join("")})->.subs;
.subs map_to_area->.a;
(node(area.a)[highway~"^(traffic_signals|crossing|bus_stop)$"];
 nwr(area.a)[amenity~"^(school|kindergarten|childcare)$"];);
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

// Overpass allows few concurrent requests, so the two OSM queries go one after the other.
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
