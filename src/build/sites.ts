// Sites: parking areas from OSM car parks, and off-road sites from OSM tracks and BCC Tracks and Trails access lines.
// Each is ruled out or kept, given a timetable from plates inside it and OSM tags, a zone tier and a tenure label.
import type { Rule } from "../timetable/timetable.ts";
import { SITE_RULE_OUT } from "./config.ts";
import { toLonLat, toXY, type LonLat, type XY } from "./geo.ts";
import type { OsmArea } from "./inputs.ts";

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
};

export const ACCESS_UNKNOWN = "Access unknown";
export const HOURS_UNKNOWN = "Hours unknown";

export type SiteInput = { parkings?: OsmArea[] };

/** The middle of a ring, as the mean of its corners (the closing corner counted once). */
function middle(ring: XY[]): XY {
  const pts = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

export function buildSites({ parkings = [] }: SiteInput): Site[] {
  const out: Site[] = [];
  for (const a of parkings) {
    const t = a.tags;
    if (SITE_RULE_OUT.ACCESS.test(t.access ?? "") || t.fee === "yes" || SITE_RULE_OUT.ON_STREET.test(t.parking ?? "")) continue;
    const accessKnown = !!t.access;
    const cautions = [
      ...(accessKnown ? [] : [ACCESS_UNKNOWN]),
      ...(t.motor_vehicle === "private" ? ["Motor vehicles: private"] : []),
      HOURS_UNKNOWN,
    ];
    const outline = a.rings?.[0]?.map(toXY) ?? null;
    const p: XY = outline ? middle(outline) : toXY([a.lon!, a.lat!]);
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
    });
  }
  return out;
}
