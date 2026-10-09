// Sites: parking areas from OSM car parks, and off-road sites from OSM tracks and BCC Tracks and Trails access lines.
// Each is ruled out or kept, given a timetable from plates inside it and OSM tags, a zone tier and a tenure label.
import type { Rule } from "../timetable/timetable.ts";
import { BARRIER, EXCLUDED, SITE_RULE_OUT } from "./config.ts";
import { frontageIndex, type Frontage } from "./frontage.ts";
import { inRings, project, toLonLat, toXY, type LonLat, type XY } from "./geo.ts";
import type { OsmArea, OsmNode, OsmWay, Zone } from "./inputs.ts";

export type SiteKind = "parking-area" | "off-road";

export type Site = {
  id: string;
  kind: SiteKind;
  name: string;
  /** The outline (a closed ring) for a car park, or a single point. */
  line: LonLat[];
  /** Where the site is: the middle of the outline, or the point. */
  point: LonLat;
  rules: Rule[];
  plates: string[];
  cautions: string[];
  /** False for an untagged car park, which orders after car parks tagged access=yes|permissive. */
  accessKnown: boolean;
  /** The City Plan zone the site sits in. */
  frontage: Frontage | null;
};

export const ACCESS_UNKNOWN = "Access unknown";
export const HOURS_UNKNOWN = "Hours unknown";

export type SiteInput = {
  parkings?: OsmArea[];
  /** OSM `highway=track` and `highway=service` ways: access ways into car parks, and the tracks off-road sites sit on. */
  minorWays?: OsmWay[];
  /** OSM points: barriers, and schools and kindergartens. */
  nodes?: OsmNode[];
  zones?: Zone[];
};

const blocks = (t: Record<string, string> | undefined) => !!t && BARRIER.BLOCKS.test(t.barrier ?? "") && t.locked !== "no";

/** The middle of a ring, as the mean of its corners (the closing corner counted once). */
function middle(ring: XY[]): XY {
  const pts = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

export function buildSites({ parkings = [], minorWays = [], nodes = [], zones = [] }: SiteInput): Site[] {
  const out: Site[] = [];
  const zoneOf = frontageIndex(zones, [], nodes);
  const schools = nodes.filter((n) => n.tags.amenity === "school" || EXCLUDED.KINDERGARTEN.test(n.tags.amenity ?? "")).map((n) => toXY([n.lon, n.lat]));
  const barriers = new Map(nodes.filter((n) => blocks(n.tags)).map((n) => [n.id, n]));
  const minor = minorWays.map((w) => ({ way: w, line: w.coords.map(toXY), gated: w.nodes.some((id) => barriers.has(id)) }));
  /** Every way into the outline has a barrier on it. False when no way in is mapped: a missing gate proves nothing. */
  const gatedOff = (outline: XY[][]) => {
    const touches = (p: XY) => inRings(outline, p) || outline.some((r) => Math.abs(project(r, p).offset) <= BARRIER.TOUCH_M);
    const ways = minor.filter((m) => m.line.some(touches));
    return ways.length > 0 && ways.every((m) => m.gated);
  };
  for (const a of parkings) {
    const t = a.tags;
    if (SITE_RULE_OUT.ACCESS.test(t.access ?? "") || t.fee === "yes" || SITE_RULE_OUT.ON_STREET.test(t.parking ?? "")) continue;
    const accessKnown = !!t.access;
    const cautions = [
      ...(accessKnown ? [] : [ACCESS_UNKNOWN]),
      ...(t.motor_vehicle === "private" ? ["Motor vehicles: private"] : []),
      HOURS_UNKNOWN,
    ];
    const rings = a.rings?.map((r) => r.map(toXY)) ?? null, outline = rings?.[0] ?? null;
    if (rings && gatedOff(rings)) continue;
    const p: XY = outline ? middle(outline) : toXY([a.lon!, a.lat!]);
    const frontage = zoneOf.at(p);
    if (frontage?.excluded || (rings && schools.some((s) => inRings(rings, s)))) continue;
    out.push({
      id: `osm-${a.type}-${a.id}`,
      kind: "parking-area",
      name: a.tags.name ?? "Car park",
      line: outline ? outline.map(toLonLat) : [toLonLat(p)],
      point: toLonLat(p),
      rules: [],
      plates: [],
      cautions,
      accessKnown,
      frontage,
    });
  }
  return out;
}
