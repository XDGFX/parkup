// Toilets: the nearest one per candidate, worked out in the build so the app needs no spatial search,
// and the toilets layer the map draws.
import { parseHours, type Hours } from "../timetable/hours.ts";
import { project, toXY, type LonLat } from "./geo.ts";
import type { ToiletRecord } from "./inputs.ts";

/** A toilet on the map, with its hours read. */
export type Toilet = { id: string; name: string; type: string | null; address: string | null; lon: number; lat: number; hours: Hours };
/** The nearest toilet to a candidate, as the card shows it. */
export type NearestToilet = { id: string; name: string; distanceM: number };

/** Toilets further than this from every candidate are left off the map. */
const LAYER_RADIUS_M = 2000;

/** For each line, its nearest toilet (null when there are none), and the toilets near enough any line to draw. */
export function nearestToilets(lines: LonLat[][], records: ToiletRecord[]): { nearest: (NearestToilet | null)[]; layer: Toilet[] } {
  const near = new Set<ToiletRecord>();
  const points = records.map((t) => toXY([t.lon, t.lat]));
  const nearest = lines.map((lonLats) => {
    const line = lonLats.map(toXY);
    let best: { t: ToiletRecord; d: number } | null = null;
    for (const [i, t] of records.entries()) {
      const d = Math.abs(project(line, points[i]!).offset);
      if (d <= LAYER_RADIUS_M) near.add(t);
      if (!best || d < best.d) best = { t, d };
    }
    if (!best) return null;
    near.add(best.t);
    // To the nearest 10 m: the card is for walking, and OSM kerbs are only good to a few metres.
    return { id: best.t.facilityid, name: best.t.name, distanceM: Math.round(best.d / 10) * 10 };
  });
  const layer = records.filter((t) => near.has(t)).map((t) => ({
    id: t.facilityid, name: t.name, type: t.facilitytype, address: t.address, lon: t.lon, lat: t.lat,
    hours: parseHours(t.openinghours ?? ""),
  }));
  return { nearest, layer };
}
