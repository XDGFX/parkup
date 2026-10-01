// Builds kerb stretches from council sign plates and OSM centrelines.
// Centrelines are joined into links between intersections, each with a left and a right kerb.
// Plates snap to a kerb, and opposite arrows of the same restriction pair up (road rules s 332).
import type { Rule } from "../timetable/timetable.ts";
import { HALF_WIDTH_M, MIN_STRETCH_M, ORIENTATION, SNAP_ANY_M, SNAP_NAMED_M } from "./config.ts";
import { compassSide, length, offset, project, slice, toLonLat, toXY, type LonLat, type XY } from "./geo.ts";
import type { OsmWay, SignRecord } from "./inputs.ts";
import { isAreaPlate, readPlate, type Plate } from "./plates.ts";

type Side = "left" | "right";
export type Reading = "carriageway" | "footpath";

/** A length of road between intersections (or dead ends), drawn in one direction. */
type Link = { id: string; name: string; highway: string; halfWidth: number; line: XY[]; length: number };

export type Stretch = {
  link: Link;
  side: Side;
  compass: "north" | "south" | "east" | "west";
  from: number;
  to: number;
  line: LonLat[];
  street: string;
  suburb: string;
  plates: string[];
  rules: Rule[];
  lowConfidence: boolean;
};

export type KerbReport = {
  areaPlates: number;
  unsnapped: number;
  unarrowed: number;
  orphanRepeaters: number;
  orientation: { carriageway: number; footpath: number; chosen: Reading; arrows: number };
  unparsed: { text: string; count: number }[];
  short: number;
};

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Joins OSM ways into links that run between intersections, dead ends and name changes. */
function links(ways: OsmWay[]): Link[] {
  type Edge = { a: number; b: number; way: OsmWay; key: string };
  const at = new Map<number, XY>(), incident = new Map<number, Edge[]>();
  for (const w of ways) {
    w.nodes.forEach((n, i) => at.set(n, toXY(w.coords[i]!)));
    for (let i = 1; i < w.nodes.length; i++) {
      const e = { a: w.nodes[i - 1]!, b: w.nodes[i]!, way: w, key: `${w.id}:${i}` };
      for (const n of [e.a, e.b]) incident.set(n, [...(incident.get(n) ?? []), e]);
    }
  }
  const isBreak = (n: number) => {
    const es = incident.get(n) ?? [];
    return es.length !== 2 || es[0]!.way.tags.name !== es[1]!.way.tags.name;
  };
  const seen = new Set<string>(), out: Link[] = [];
  const walk = (start: number, first: Edge) => {
    const nodes = [start];
    let cur = start, e: Edge | undefined = first;
    while (e && !seen.has(e.key)) {
      seen.add(e.key);
      cur = e.a === cur ? e.b : e.a;
      nodes.push(cur);
      if (isBreak(cur)) break;
      e = incident.get(cur)!.find((x) => !seen.has(x.key));
    }
    const line = nodes.map((n) => at.get(n)!), tags = first.way.tags;
    const highway = (tags.highway ?? "").replace(/_link$/, "");
    const width = Number.parseFloat(tags.width ?? "");
    out.push({
      id: `${nodes[0]}-${nodes.at(-1)}-${first.way.id}`,
      name: tags.name ?? "",
      highway,
      halfWidth: width > 0 ? width / 2 : HALF_WIDTH_M[highway] ?? 4,
      line,
      length: length(line),
    });
  };
  const nodes = [...incident.keys()].sort((a, b) => a - b);
  for (const n of nodes) if (isBreak(n)) for (const e of incident.get(n)!) if (!seen.has(e.key)) walk(n, e);
  // Loops with no intersection on them.
  for (const n of nodes) for (const e of incident.get(n)!) if (!seen.has(e.key)) walk(n, e);
  return out;
}

type Arrow = "L" | "R" | "D";
type Placed = { record: SignRecord; plate: Plate; index: number; link: Link; side: Side; along: number; arrow?: Arrow };

function arrowOf(r: SignRecord): Arrow | undefined {
  const d = (r.signdirection ?? "").toLowerCase();
  if (d === "left") return "L";
  if (d === "right") return "R";
  if (d === "bi-directional") return "D";
  const fromCode = (r.bccallocationcode ?? "").replace(/rx$/i, "").slice(-1).toUpperCase();
  return fromCode === "L" || fromCode === "R" || fromCode === "D" ? fromCode : undefined;
}

/**
 * Which way along the link an arrow points: +1 forwards, -1 backwards, 0 for a repeater.
 * Read from the carriageway, a Left arrow on the right-hand kerb points forwards; from the footpath, backwards.
 */
function direction(arrow: Arrow, side: Side, reading: Reading): number {
  if (arrow === "D") return 0;
  const d = (arrow === "L" ? 1 : -1) * (side === "right" ? 1 : -1);
  return reading === "carriageway" ? d : -d;
}

type Interval = { from: number; to: number; placed: Placed; lowConfidence: boolean };

/** Pairs the arrows of one restriction on one kerb. Returns its intervals and how many arrows paired cleanly. */
function pair(plates: Placed[], reading: Reading) {
  const intervals: Interval[] = [];
  let open: Placed | null = null, clean = 0, arrows = 0, orphans = 0;
  for (const p of plates) {
    const d = direction(p.arrow!, p.side, reading);
    if (d === 0) { if (!open) orphans++; continue; }
    arrows++;
    if (d > 0) { open ??= p; continue; }
    if (open) { intervals.push({ from: open.along, to: p.along, placed: open, lowConfidence: false }); clean += 2; open = null; }
    else intervals.push({ from: 0, to: p.along, placed: p, lowConfidence: true });
  }
  if (open) intervals.push({ from: open.along, to: open.link.length, placed: open, lowConfidence: true });
  return { intervals, clean, arrows, orphans };
}

export function buildKerbs(signs: SignRecord[], ways: OsmWay[]): { stretches: Stretch[]; report: KerbReport } {
  const all = links(ways);
  const unparsed = new Map<string, number>();
  let areaPlates = 0, unsnapped = 0, unarrowed = 0;

  // Snap each plate to a kerb: the street it names if that's close, else the nearest centreline.
  const placed: Placed[] = [];
  signs.forEach((record, index) => {
    if (isAreaPlate(record.parkingrestrictiontype ?? "")) { areaPlates++; return; }
    const plate = readPlate(record);
    if (plate.unparsed) unparsed.set(plate.unparsed, (unparsed.get(plate.unparsed) ?? 0) + 1);
    const p = toXY([record.lon, record.lat]), street = norm(record.street ?? "");
    let named: { link: Link; along: number; offset: number } | undefined, any: typeof named;
    for (const link of all) {
      const hit = project(link.line, p), d = Math.abs(hit.offset);
      if (norm(link.name) === street && d <= SNAP_NAMED_M && (!named || d < Math.abs(named.offset))) named = { link, ...hit };
      if (d <= SNAP_ANY_M && (!any || d < Math.abs(any.offset))) any = { link, ...hit };
    }
    const hit = named ?? any;
    if (!hit) { unsnapped++; return; }
    placed.push({ record, plate, index, link: hit.link, side: hit.offset > 0 ? "left" : "right", along: hit.along, arrow: arrowOf(record) });
  });

  // Plates on one post are read together: one with no arrow takes the arrow its post-mates agree on.
  const posts = Map.groupBy(placed, (p) => `${p.link.id}|${p.record.lon}|${p.record.lat}`);
  for (const post of posts.values()) {
    const arrows = new Set(post.map((p) => p.arrow).filter(Boolean));
    for (const p of post) if (!p.arrow && arrows.size === 1) p.arrow = [...arrows][0];
  }
  const arrowed = placed.filter((p) => p.arrow);
  unarrowed = placed.length - arrowed.length;

  // Pair each restriction on each kerb, both ways round.
  const groups = [...Map.groupBy(arrowed, (p) => [p.link.id, p.side, p.record.parkingrestrictiontype, p.record.parkingrestrictiondaysandtimes].join("|")).values()]
    .map((g) => g.sort((a, b) => a.along - b.along || a.index - b.index));
  const tally = (reading: Reading) => {
    const results = groups.map((g) => pair(g, reading));
    const clean = results.reduce((n, r) => n + r.clean, 0), arrows = results.reduce((n, r) => n + r.arrows, 0);
    return { results, share: arrows ? clean / arrows : 0, clean, arrows };
  };
  const carriageway = tally("carriageway"), footpath = tally("footpath");
  const chosen = orientation(carriageway, footpath);
  const { results } = chosen === "carriageway" ? carriageway : footpath;

  // Split each kerb where the rules change: every piece carries the intervals that cover it.
  const stretches: Stretch[] = [];
  let short = 0;
  const kerbs = Map.groupBy(results.flatMap((r) => r.intervals), (i) => `${i.placed.link.id}|${i.placed.side}`);
  for (const intervals of kerbs.values()) {
    intervals.sort((a, b) => a.from - b.from || a.placed.index - b.placed.index);
    const cuts = [...new Set(intervals.flatMap((i) => [i.from, i.to]))].sort((a, b) => a - b);
    const pieces: { from: number; to: number; cover: Interval[] }[] = [];
    for (let k = 1; k < cuts.length; k++) {
      const from = cuts[k - 1]!, to = cuts[k]!, cover = intervals.filter((i) => i.from <= from && i.to >= to);
      if (!cover.length || to - from < 0.01) continue;
      const last = pieces.at(-1);
      if (last && last.to === from && sameCover(last.cover, cover)) last.to = to;
      else pieces.push({ from, to, cover });
    }
    for (const piece of pieces) {
      if (piece.to - piece.from < MIN_STRETCH_M) { short++; continue; }
      stretches.push(stretch(piece.from, piece.to, piece.cover));
    }
  }

  const sum = (k: "orphans") => (chosen === "carriageway" ? carriageway : footpath).results.reduce((n, r) => n + r[k], 0);
  return {
    stretches,
    report: {
      areaPlates, unsnapped, unarrowed, orphanRepeaters: sum("orphans"),
      orientation: { carriageway: round2(carriageway.share), footpath: round2(footpath.share), chosen, arrows: carriageway.arrows },
      unparsed: [...unparsed].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)),
      short,
    },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sameCover = (a: Interval[], b: Interval[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Picks the reading that pairs cleanly, or fails the build when neither clearly wins. */
function orientation(c: { share: number; clean: number }, f: { share: number; clean: number }): Reading {
  // With no pairs either way there's nothing to check, so keep the reading the research found on Adsett St.
  if (!c.clean && !f.clean) return "carriageway";
  const [win, lose, name]: [number, number, Reading] = c.share >= f.share ? [c.share, f.share, "carriageway"] : [f.share, c.share, "footpath"];
  if (win < ORIENTATION.MIN_SHARE || win - lose < ORIENTATION.MARGIN) {
    throw new Error(`Orientation check failed: neither reading clearly wins (carriageway ${pct(c.share)}, footpath ${pct(f.share)} of arrows pair cleanly)`);
  }
  return name;
}
const pct = (n: number) => `${Math.round(n * 100)}%`;

function stretch(from: number, to: number, cover: Interval[]): Stretch {
  const { link, side, record } = cover[0]!.placed;
  const plates = [...new Set(cover.map((i) => i.placed.plate.label))];
  const rules = [...new Map(cover.flatMap((i) => i.placed.plate.rules).map((r) => [JSON.stringify(r), r])).values()];
  const kerb = offset(slice(link.line, from, to), side === "left" ? link.halfWidth : -link.halfWidth);
  return {
    link, side, from, to,
    compass: compassSide(slice(link.line, from, to), side),
    line: kerb.map(toLonLat),
    street: link.name || titleCase(record.street ?? ""),
    suburb: titleCase(record.suburb ?? ""),
    plates, rules,
    lowConfidence: cover.some((i) => i.lowConfidence),
  };
}
