// Fetches and pins the build's inputs: BCC parking signs and OSM road centrelines for the three suburbs.
// Run: npm run snapshot. Writes data/snapshot/*.json, which are committed so a rebuild is repeatable.
import { mkdir, writeFile } from "node:fs/promises";
import type { OsmWay, SignRecord, Snapshot, ToiletRecord } from "./inputs.ts";

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

// The main Overpass server is often busy (504), so fall back to a mirror. Both refuse requests without a User-Agent.
async function overpass(query: string): Promise<unknown> {
  const errors: string[] = [];
  for (const url of OVERPASS) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": "parkup-snapshot (https://github.com/XDGFX/parkup)", Accept: "application/json" },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return res.json();
    errors.push(`${url}: ${res.status}`);
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

const [s, w, t] = await Promise.all([signs(), ways(), toilets()]);
const snapshot: Snapshot = { takenAt: new Date().toISOString(), signs: s, ways: w };
await mkdir("data/snapshot", { recursive: true });
await writeFile("data/snapshot/signs.json", JSON.stringify({ takenAt: snapshot.takenAt, signs: s }, null, 0));
await writeFile("data/snapshot/osm.json", JSON.stringify({ takenAt: snapshot.takenAt, ways: w }, null, 0));
await writeFile("data/snapshot/toilets.json", JSON.stringify({ takenAt: snapshot.takenAt, toilets: t }, null, 0));
console.log(`snapshot: ${s.length} sign plates, ${w.length} OSM ways, ${t.length} toilets`);
