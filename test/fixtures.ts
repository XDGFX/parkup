// Hand-made build inputs, laid out in metres around a point in Taringa and converted to lon/lat.
import type { KerbLine, OsmNode, OsmWay, PermitArea, SignRecord, Zone } from "../src/build/inputs.ts";

const LON0 = 153.0, LAT0 = -27.5, R = 6371008.8, RAD = Math.PI / 180;
export const lonLat = (x: number, y: number): [number, number] =>
  [LON0 + x / (R * RAD * Math.cos(LAT0 * RAD)), LAT0 + y / (R * RAD)];

export function way(id: number, name: string, nodes: number[], pts: [number, number][], highway = "residential"): OsmWay {
  return { id, tags: { highway, name }, nodes, coords: pts.map(([x, y]) => lonLat(x, y)) };
}

/**
 * Test Street runs north to south for 200 m, drawn north to south, between Top Road and Bottom Road.
 * Its west kerb is at x = -4 and its east kerb at x = 4; y runs from 0 (Top Road) to -200 (Bottom Road).
 */
export const testStreet: OsmWay[] = [
  way(1, "Test Street", [1, 2], [[0, 0], [0, -200]]),
  way(2, "Top Road", [10, 1, 11], [[-100, 0], [0, 0], [100, 0]]),
  way(3, "Bottom Road", [20, 2, 21], [[-100, -200], [0, -200], [100, -200]]),
];

let n = 0;
type SignOpts = { x: number; y: number; dir: "Left" | "Right" | "Bi-Directional" | "Not applicable"; type: string; times?: string | null; street?: string; desc?: string | null; code?: string | null; multi?: 0 | 1 };
export function sign(o: SignOpts): SignRecord {
  const [lon, lat] = lonLat(o.x, o.y);
  return {
    assetid: `SN-${++n}`,
    street: o.street ?? "TEST STREET",
    suburb: "TARINGA",
    lon, lat,
    signdirection: o.dir,
    bccallocationcode: o.code ?? null,
    multisignsegment: o.multi ?? 0,
    parkingrestrictiontype: o.type,
    parkingrestrictiondaysandtimes: o.times ?? null,
    parkingrestrictiondescription: o.desc ?? null,
  };
}

/**
 * A pair of plates governing the west kerb of Test Street from y0 south to y1, as BCC records them:
 * arrows read from the carriageway, so on the west kerb Left points south.
 */
export const westPair = (y0: number, y1: number, type: string, times: string | null = null) => [
  sign({ x: -4, y: y0, dir: "Left", type, times }),
  sign({ x: -4, y: y1, dir: "Right", type, times }),
];
/** The same on the east kerb, where Right points south. */
export const eastPair = (y0: number, y1: number, type: string, times: string | null = null) => [
  sign({ x: 4, y: y0, dir: "Right", type, times }),
  sign({ x: 4, y: y1, dir: "Left", type, times }),
];

/** An OSM point feature, such as traffic signals, a crossing, a bus stop or a kindergarten. */
export const node = (id: number, x: number, y: number, tags: Record<string, string>): OsmNode => {
  const [lon, lat] = lonLat(x, y);
  return { id, lon, lat, tags };
};

/** A BCC yellow no-stopping line from (x0, y0) to (x1, y1). */
export const yellowLine = (x0: number, y0: number, x1: number, y1: number): KerbLine => ({ assetid: `YL-${++n}`, coords: [lonLat(x0, y0), lonLat(x1, y1)] });

const rect = (x0: number, y0: number, x1: number, y1: number) => [[lonLat(x0, y0), lonLat(x1, y0), lonLat(x1, y1), lonLat(x0, y1), lonLat(x0, y0)]];
/** A City Plan zone covering the rectangle between (x0, y0) and (x1, y1). */
export const zone = (code: string, x0: number, y0: number, x1: number, y1: number): Zone => ({ code, name: code, rings: rect(x0, y0, x1, y1) });
/** A permit area covering the rectangle between (x0, y0) and (x1, y1). */
export const area = (name: string, x0: number, y0: number, x1: number, y1: number): PermitArea => ({ name, rings: rect(x0, y0, x1, y1) });
