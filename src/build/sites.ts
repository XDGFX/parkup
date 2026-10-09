// Sites: parking areas from OSM car parks, and off-road sites from OSM tracks and BCC Tracks and Trails access lines.
// Each is ruled out or kept, given a timetable from plates inside it and OSM tags, a zone tier and a tenure label.
import type { Rule } from "../timetable/timetable.ts";
import { BARRIER, EXCLUDED, SITE_RULE_OUT, TRACKS, TRAILS } from "./config.ts";
import { frontageIndex, type Frontage } from "./frontage.ts";
import { dist, inRings, length, pointAt, project, toLonLat, toXY, type LonLat, type XY } from "./geo.ts";
import type { OsmArea, OsmNode, OsmWay, QldTrack, SignRecord, TrailLine, Zone } from "./inputs.ts";
import { osmTimetable } from "./osmHours.ts";
import { readPlate } from "./plates.ts";

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
  /** Any plates inside it or OSM time tags. Without them it's open at all times, with an "hours unknown" caution. */
  hasTimetable: boolean;
  /** False for an untagged car park, which orders after car parks tagged access=yes|permissive. */
  accessKnown: boolean;
  /** The City Plan zone the site sits in. */
  frontage: Frontage | null;
  /** QLD Roads and Tracks `trafficability` of the track it's on, such as "4WD". */
  trafficability: string | null;
};

export const ACCESS_UNKNOWN = "Access unknown";
export const HOURS_UNKNOWN = "Hours unknown";

export type SiteInput = {
  /** Public road centrelines, which tracks leave from. */
  ways?: OsmWay[];
  parkings?: OsmArea[];
  /** OSM `highway=track` and `highway=service` ways: access ways into car parks, and the tracks off-road sites sit on. */
  minorWays?: OsmWay[];
  /** OSM points: barriers, and schools and kindergartens. */
  nodes?: OsmNode[];
  zones?: Zone[];
  /** BCC sign plates: those inside a car park's outline govern it. */
  signs?: SignRecord[];
  qldTracks?: QldTrack[];
  trails?: TrailLine[];
};

const blocks = (t: Record<string, string> | undefined) => !!t && BARRIER.BLOCKS.test(t.barrier ?? "") && t.locked !== "no";
const shut = (t: Record<string, string>) => SITE_RULE_OUT.NO_VEHICLES.test(t.access ?? "") || SITE_RULE_OUT.NO_VEHICLES.test(t.motor_vehicle ?? "");

/** The middle of a ring, as the mean of its corners (the closing corner counted once). */
function middle(ring: XY[]): XY {
  const pts = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** A site before its zone, exclusions and default timetable are applied. */
type Raw = Omit<Site, "frontage" | "hasTimetable" | "cautions" | "trafficability" | "point"> & {
  p: XY; rings: XY[][] | null; cautions: string[]; hasTimetable: boolean; trafficability?: string | null;
};

export function buildSites({ ways = [], parkings = [], minorWays = [], nodes = [], zones = [], signs = [], qldTracks = [], trails = [] }: SiteInput): Site[] {
  const plates = signs.map((s) => ({ p: toXY([s.lon, s.lat]), plate: readPlate(s) }));
  const zoneOf = frontageIndex(zones, [], nodes);
  const schools = nodes.filter((n) => n.tags.amenity === "school" || EXCLUDED.KINDERGARTEN.test(n.tags.amenity ?? "")).map((n) => toXY([n.lon, n.lat]));
  const barriers = new Set(nodes.filter((n) => blocks(n.tags)).map((n) => n.id));
  const minor = minorWays.map((w) => ({ way: w, line: w.coords.map(toXY), gated: w.nodes.some((id) => barriers.has(id)) }));

  /** Every way into the outline has a barrier on it. False when no way in is mapped: a missing gate proves nothing. */
  const gatedOff = (outline: XY[][]) => {
    const touches = (p: XY) => inRings(outline, p) || outline.some((r) => Math.abs(project(r, p).offset) <= BARRIER.TOUCH_M);
    const ins = minor.filter((m) => m.line.some(touches));
    return ins.length > 0 && ins.every((m) => m.gated);
  };

  const raw: Raw[] = [];
  for (const a of parkings) {
    const t = a.tags;
    if (SITE_RULE_OUT.ACCESS.test(t.access ?? "") || t.fee === "yes" || SITE_RULE_OUT.ON_STREET.test(t.parking ?? "")) continue;
    const rings = a.rings?.map((r) => r.map(toXY)) ?? null, outline = rings?.[0] ?? null;
    if (rings && gatedOff(rings)) continue;
    const inside = rings ? plates.filter((p) => inRings(rings, p.p)).map((p) => p.plate) : [];
    const osm = osmTimetable(t);
    const p: XY = outline ? middle(outline) : toXY([a.lon!, a.lat!]);
    raw.push({
      id: `osm-${a.type}-${a.id}`, kind: "parking-area", name: t.name ?? "Car park",
      line: outline ? outline.map(toLonLat) : [toLonLat(p)], p, rings,
      rules: [...inside.flatMap((x) => x.rules), ...osm.rules], plates: inside.map((x) => x.label),
      cautions: [...(t.access ? [] : [ACCESS_UNKNOWN]), ...(t.motor_vehicle === "private" ? ["Motor vehicles: private"] : []), ...osm.cautions],
      hasTimetable: osm.hasData || inside.length > 0, accessKnown: !!t.access,
    });
  }
  raw.push(...trackSites(ways, minorWays, barriers), ...trailSites(trails, ways, minorWays));

  const qld = qldTracks.map((q) => ({ ...q, line: q.coords.map(toXY) }));
  const out: Site[] = [];
  for (const { p, rings, ...r } of raw) {
    const frontage = zoneOf.at(p);
    if (frontage?.excluded || (rings && schools.some((s) => inRings(rings, s)))) continue;
    const trafficability = r.kind === "off-road"
      ? qld.find((q) => Math.abs(project(q.line, p).offset) <= TRACKS.QLD_MATCH_M)?.trafficability ?? null
      : null;
    out.push({ ...r, point: toLonLat(p), frontage, trafficability, cautions: [...r.cautions, ...(r.hasTimetable ? [] : [HOURS_UNKNOWN])] });
  }
  return out;
}

/**
 * Off-road sites on OSM tracks: where a track leaves a public road (a little way in), and at the dead ends of the
 * track network reachable from there. The walk stops at a barrier and never uses a track closed to vehicles.
 */
function trackSites(roads: OsmWay[], minorWays: OsmWay[], barriers: Set<number>): Raw[] {
  // Public roads: the centrelines, and service roads other than driveways, unless closed to vehicles.
  const isRoad = (w: OsmWay) => !shut(w.tags) && (w.tags.highway !== "service" || w.tags.service !== "driveway");
  const roadName = new Map<number, string>();
  for (const w of [...roads, ...minorWays.filter((w) => w.tags.highway === "service")].filter(isRoad))
    for (const n of w.nodes) if (!roadName.has(n) || w.tags.name) roadName.set(n, w.tags.name ?? "");
  const tracks = minorWays.filter((w) => w.tags.highway === "track" && !shut(w.tags)).map((w) => ({ w, line: w.coords.map(toXY) }));

  // The track graph: each node's neighbours along a track.
  const next = new Map<number, number[]>();
  for (const { w } of tracks) w.nodes.forEach((n, i) => {
    const nb = [w.nodes[i - 1], w.nodes[i + 1]].filter((x): x is number => x !== undefined);
    next.set(n, [...(next.get(n) ?? []), ...nb]);
  });

  // Walk from every unbarred track node on a road, remembering which road each node was reached from.
  const reachedFrom = new Map<number, string>();
  const queue: number[] = [];
  for (const n of next.keys()) if (roadName.has(n) && !barriers.has(n)) { reachedFrom.set(n, roadName.get(n)!); queue.push(n); }
  while (queue.length) {
    const n = queue.shift()!;
    for (const m of next.get(n)!) if (!reachedFrom.has(m) && !barriers.has(m)) { reachedFrom.set(m, reachedFrom.get(n)!); queue.push(m); }
  }
  const label = (road: string) => `Track off ${road || "a service road"}`;
  const site = (id: string, name: string, p: XY): Raw => ({
    id, kind: "off-road", name, line: [toLonLat(p)], p, rings: null, rules: [], plates: [], cautions: [], hasTimetable: false, accessKnown: true,
  });

  const out: Raw[] = [];
  for (const { w, line } of tracks) {
    // Distance along the way of each node.
    const along = w.nodes.map((_, i) => length(line.slice(0, i + 1)));
    w.nodes.forEach((n, i) => {
      if (roadName.has(n) && reachedFrom.has(n)) {
        // Into the track from the road, the longer way if it crosses; the site is ENTRY_M in, if nothing bars the way there.
        const ahead = along.at(-1)! - along[i]!, behind = along[i]!;
        const dir = ahead >= behind ? 1 : -1, room = Math.max(ahead, behind);
        if (!room) return;
        const s = along[i]! + dir * Math.min(TRACKS.ENTRY_M, room);
        const passed = w.nodes.filter((_, j) => (dir > 0 ? j > i && along[j]! <= s : j < i && along[j]! >= s));
        if (passed.some((m) => !reachedFrom.has(m) || roadName.has(m))) return;
        out.push(site(`osm-track-${w.id}-${n}`, label(roadName.get(n)!), pointAt(line, s).p));
      } else if (!roadName.has(n) && reachedFrom.has(n) && next.get(n)!.length === 1) {
        out.push(site(`osm-track-${w.id}-${n}-end`, label(reachedFrom.get(n)!), line[i]!));
      }
    });
  }
  // A dead end close to an entry is the same place.
  const entries = out.filter((s) => !s.id.endsWith("-end"));
  return out.filter((s) => !s.id.endsWith("-end") || entries.every((e) => dist(e.p, s.p) >= TRACKS.END_MIN_M));
}

/**
 * Off-road sites from BCC Tracks and Trails access lines that OSM doesn't map: one ENTRY_M in from the end nearer a road.
 * A line counts as mapped when most of it lies within TRAIL_MATCH_M of an OSM road, track or service way.
 */
function trailSites(trails: TrailLine[], roads: OsmWay[], minorWays: OsmWay[]): Raw[] {
  const osm = [...roads, ...minorWays].map((w) => w.coords.map(toXY));
  const roadLines = [...roads, ...minorWays.filter((w) => w.tags.highway === "service")].map((w) => w.coords.map(toXY));
  const near = (lines: XY[][], p: XY) => Math.min(Infinity, ...lines.map((l) => Math.abs(project(l, p).offset)));
  const out: Raw[] = [];
  for (const t of trails) {
    if (!TRAILS.ITEM_TYPES.includes(t.itemType)) continue;
    let line = t.coords.map(toXY);
    const len = length(line);
    if (len < 1) continue;
    const samples = Array.from({ length: Math.floor(len / TRAILS.SAMPLE_M) + 1 }, (_, i) => pointAt(line, i * TRAILS.SAMPLE_M).p);
    if (samples.filter((p) => near(osm, p) <= TRAILS.MATCH_M).length / samples.length >= TRAILS.MAPPED_SHARE) continue;
    if (near(roadLines, line.at(-1)!) < near(roadLines, line[0]!)) line = [...line].reverse();
    const management = MANAGEMENT.test(t.itemType) || MANAGEMENT.test(t.description ?? "");
    out.push({
      id: `bcc-trail-${t.id}`, kind: "off-road", name: `${t.park ? titleCase(t.park) : "Park"} access road`,
      line: [], p: pointAt(line, Math.min(TRACKS.ENTRY_M, len)).p, rings: null, rules: [], plates: [],
      cautions: management ? ["Management access only"] : [], hasTimetable: false, accessKnown: true,
    });
  }
  return out.map((s) => ({ ...s, line: [toLonLat(s.p)] }));
}

const MANAGEMENT = /management access only/i;
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
