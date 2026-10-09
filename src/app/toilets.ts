// Toilets: small, quiet pins under the kerbs, greyed when their hours say closed for the window,
// and the nearest one on each candidate's card.
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { Candidate } from "../build/build.ts";
import type { Toilet } from "../build/toilets.ts";
import { closedFor } from "../timetable/hours.ts";
import type { Window } from "../timetable/timetable.ts";

export type Toilets = Map<string, Toilet>;

const OPEN = "#8FB3C9", CLOSED = "#4A4A52";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function loadToilets(): Promise<Toilets> {
  try {
    const { toilets } = (await (await fetch("./toilets.json")).json()) as { toilets: Toilet[] };
    return new Map(toilets.map((t) => [t.id, t]));
  } catch {
    return new Map(); // The map still works without toilets.
  }
}

/** Adds the toilet layer. Call before the candidate layers, so the kerbs draw on top. */
export function addToiletLayer(map: MlMap) {
  map.addSource("toilets", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "toilet", type: "circle", source: "toilets", paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2, 16, 4.5],
    "circle-color": ["case", ["get", "closed"], CLOSED, OPEN],
    "circle-opacity": ["case", ["get", "closed"], 0.7, 0.85],
    "circle-stroke-color": "#111113", "circle-stroke-width": 1 } });
}

export function paintToilets(map: MlMap, toilets: Toilets, win: Window) {
  (map.getSource("toilets") as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: [...toilets.values()].map((t) => ({
      type: "Feature", id: t.id, geometry: { type: "Point", coordinates: [t.lon, t.lat] },
      properties: { id: t.id, closed: closedFor(t.hours, win) },
    })),
  });
}

const fmtDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** The nearest toilet, as a card fact: name, distance and hours, warm when it's shut for the window. */
export function toiletFact(c: Candidate, toilets: Toilets, win: Window): string {
  if (!c.toilet) return "";
  const t = toilets.get(c.toilet.id);
  const hours = t?.hours.text.replace(/^OPEN:\s*/i, "") || "Hours not listed";
  const closed = t ? closedFor(t.hours, win) : false;
  return `<dt>Toilet</dt><dd>${esc(c.toilet.name)} · ${fmtDistance(c.toilet.distanceM)}
    <span class="kv toilet-hours${closed ? " shut" : ""}">${esc(hours)}${closed ? " · closed for this window" : ""}</span></dd>`;
}
