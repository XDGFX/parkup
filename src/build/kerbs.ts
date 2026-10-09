// Builds kerb stretches from council sign plates, yellow lines, OSM centrelines and City Plan zoning.
// Centrelines are joined into links between intersections, each with a left and a right kerb.
// Plates snap to a kerb, and opposite arrows of the same restriction pair up (road rules s 332).
// Every kerb is then cut where its rules or frontage change, trimmed, and dropped where too short.
import type { Rule } from "../timetable/timetable.ts";
import {
  BUS_STOP, CROSSING, FRONTAGE, HALF_WIDTH_M, KERB_NEAR_M, MIN_STRETCH_M, NO_UNSIGNED, ORIENTATION, POST_M, SETBACK,
  SNAP_ANY_M, SNAP_NAMED_M, ST_LUCIA_TRAFFIC_AREA,
} from "./config.ts";
import { frontageIndex, type Frontage, type FrontageCoverage } from "./frontage.ts";
import { compassSide, type Compass, dist, length, offset, pointAt, project, slice, toLonLat, toXY, type LonLat, type XY } from "./geo.ts";
import type { KerbLine, OsmNode, OsmWay, PermitArea, SignRecord, Zone } from "./inputs.ts";
import { isAreaPlate, readPlate, type Plate } from "./plates.ts";

type Side = "left" | "right";
export type Reading = "carriageway" | "footpath";

/** A length of road between intersections (or dead ends), drawn in one direction. */
type Link = {
  id: string; name: string; highway: string; slip: boolean; halfWidth: number; line: XY[]; length: number;
  /** The s 170 setback at each end, per kerb. */
  setback: { start: Record<Side, number>; end: Record<Side, number> };
  /** The OSM ways along the link, and whether each is drawn against it (which swaps its left and right). */
  segments: { from: number; to: number; tags: Record<string, string>; reversed: boolean }[];
};

export type Stretch = {
  link: Link;
  side: Side;
  compass: Compass;
  from: number;
  to: number;
  line: LonLat[];
  street: string;
  suburb: string;
  plates: string[];
  /** The rules read strictly: an unreadable plate always applies. */
  rules: Rule[];
  /** The rules read leniently: an unreadable plate never applies. */
  lenientRules: Rule[];
  /** Text of the plates that couldn't be read. */
  unparsed: string[];
  cautions: string[];
  lowConfidence: boolean;
  signed: boolean;
  frontage: Frontage | null;
};

export type KerbReport = {
  areaPlates: number;
  /** Area plates for metered parking areas, which this build doesn't apply yet. */
  paidAreaPlates: number;
  unsnapped: number;
  unarrowed: number;
  orphanRepeaters: number;
  orientation: { carriageway: number; footpath: number; chosen: Reading; arrows: number };
  unparsed: { text: string; count: number }[];
  short: number;
  /** Metres of kerb removed because OSM tags it `parking:*=no`. */
  parkingNoM: number;
  /** Metres of kerb removed because it faces a school or kindergarten. */
  excludedM: { school: number; kindergarten: number };
  coverage: FrontageCoverage;
  /** Kerb with no frontage found within the probe distance. */
  noFrontageM: number;
};

export type KerbInput = { signs: SignRecord[]; ways: OsmWay[]; nodes?: OsmNode[]; lines?: KerbLine[]; zones?: Zone[]; areas?: PermitArea[] };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const halfWidthOf = (tags: Record<string, string>) => {
  const width = Number.parseFloat(tags.width ?? "");
  return width > 0 ? width / 2 : HALF_WIDTH_M[(tags.highway ?? "").replace(/_link$/, "")] ?? 4;
};
const SIDES: Side[] = ["left", "right"];

/** Joins OSM ways into links that run between intersections, dead ends and name changes. */
function links(ways: OsmWay[], signals: XY[]): Link[] {
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

  /** s 170: how far each kerb of a link is set back from the intersection at node `n`, where the link's own edge is `own`. */
  const setbackAt = (n: number, own: Edge, line: XY[], name: string | undefined): Record<Side, number> => {
    const es = incident.get(n) ?? [];
    if (es.length < 3) return { left: 0, right: 0 };
    const p = at.get(n)!, others = es.filter((e) => e !== own);
    const lights = signals.some((s) => dist(s, p) <= SETBACK.SIGNALS_NEAR_M);
    const base = lights ? SETBACK.LIGHTS_M : SETBACK.NO_LIGHTS_M;
    const crossing = others.filter((e) => e.way.tags.name !== name);
    if (es.length === 3 && crossing.length === 1 && !lights) {
      // A T-intersection this road runs straight through: only the kerb on the side road's side is set back.
      const stem = crossing[0]!, far = at.get(stem.a === n ? stem.b : stem.a)!;
      const stemSide: Side = project(line, far).offset > 0 ? "left" : "right";
      const d = base + halfWidthOf(stem.way.tags);
      return { left: stemSide === "left" ? d : 0, right: stemSide === "right" ? d : 0 };
    }
    const d = base + Math.max(...(crossing.length ? crossing : others).map((e) => halfWidthOf(e.way.tags)));
    return { left: d, right: d };
  };

  const seen = new Set<string>(), out: Link[] = [];
  const walk = (start: number, first: Edge) => {
    const nodes = [start], edges: { e: Edge; reversed: boolean }[] = [];
    let cur = start, e: Edge | undefined = first;
    while (e && !seen.has(e.key)) {
      seen.add(e.key);
      edges.push({ e, reversed: e.a !== cur });
      cur = e.a === cur ? e.b : e.a;
      nodes.push(cur);
      if (isBreak(cur)) break;
      e = incident.get(cur)!.find((x) => !seen.has(x.key));
    }
    const line = nodes.map((n) => at.get(n)!), tags = first.way.tags;
    const segments: Link["segments"] = [];
    let run = 0;
    edges.forEach(({ e, reversed }, i) => {
      const len = dist(line[i]!, line[i + 1]!);
      const last = segments.at(-1);
      if (last && last.tags === e.way.tags && last.reversed === reversed) last.to = run + len;
      else segments.push({ from: run, to: run + len, tags: e.way.tags, reversed });
      run += len;
    });
    out.push({
      id: `${nodes[0]}-${nodes.at(-1)}-${first.way.id}`,
      name: tags.name ?? "",
      highway: (tags.highway ?? "").replace(/_link$/, ""),
      slip: /_link$/.test(tags.highway ?? ""),
      halfWidth: halfWidthOf(tags),
      line,
      length: length(line),
      setback: {
        start: setbackAt(nodes[0]!, edges[0]!.e, line, tags.name),
        end: setbackAt(nodes.at(-1)!, edges.at(-1)!.e, line, tags.name),
      },
      segments,
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

/**
 * Groups plates into posts: plates at the same point, or flagged `multisignsegment` and within POST_M
 * along the same kerb (the council often records the plates on one post a metre or so apart).
 */
function posts(placed: Placed[]): Placed[][] {
  const out: Placed[][] = [];
  for (const kerb of Map.groupBy(placed, (p) => `${p.link.id}|${p.side}`).values()) {
    kerb.sort((a, b) => a.along - b.along);
    let post: Placed[] = [];
    for (const p of kerb) {
      const prev = post.at(-1);
      const samePoint = prev && prev.record.lon === p.record.lon && prev.record.lat === p.record.lat;
      const sameMulti = prev && prev.record.multisignsegment === 1 && p.record.multisignsegment === 1 && p.along - prev.along <= POST_M;
      if (prev && !samePoint && !sameMulti) { out.push(post); post = []; }
      post.push(p);
    }
    if (post.length) out.push(post);
  }
  return out;
}

type Interval = { from: number; to: number; placed: Placed; lowConfidence: boolean };
type Span = { from: number; to: number };

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

/** The kerb a point belongs to: the nearest link whose kerb, on that side, is within `reach` of it. */
function nearestKerb(all: Link[], p: XY, reach: (l: Link) => number) {
  let best: { link: Link; along: number; offset: number } | undefined;
  for (const link of all) {
    const hit = project(link.line, p), d = Math.abs(hit.offset);
    if (d <= reach(link) && (!best || d < Math.abs(best.offset))) best = { link, ...hit };
  }
  return best;
}

const kerbKey = (link: Link, side: Side) => `${link.id}|${side}`;
const within = (spans: Span[], s: number) => spans.some((x) => x.from <= s && s <= x.to);
const overlaps = (spans: Span[], a: number, b: number) => spans.some((x) => x.from < b && x.to > a);
/** Traffic passes the left kerb going forwards along the link, and the right kerb going backwards. */
const buffer = (side: Side, at: number, before: number, after: number): Span =>
  side === "left" ? { from: at - before, to: at + after } : { from: at - after, to: at + before };

export function buildKerbs(input: KerbInput): { stretches: Stretch[]; report: KerbReport } {
  const { signs, ways, nodes = [], lines = [], zones = [], areas = [] } = input;
  const nodesXY = nodes.map((n) => ({ tags: n.tags, p: toXY([n.lon, n.lat]) }));
  const all = links(ways, nodesXY.filter((n) => n.tags.highway === "traffic_signals").map((n) => n.p));
  const frontage = frontageIndex(zones, areas, nodes);
  const unparsed = new Map<string, number>();
  let areaPlates = 0, paidAreaPlates = 0, unsnapped = 0, unarrowed = 0;

  // Snap each plate to a kerb: the street it names if that's close, else the nearest centreline.
  const placed: Placed[] = [];
  signs.forEach((record, index) => {
    if (isAreaPlate(record.parkingrestrictiontype ?? "")) {
      areaPlates++;
      if (/METER/i.test(record.parkingrestrictiondescription ?? "")) paidAreaPlates++;
      return;
    }
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
  for (const post of posts(placed)) {
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
  const orphanRepeaters = results.reduce((n, r) => n + r.orphans, 0);

  // Yellow no-stopping lines, and the cautions from OSM points, onto their kerbs.
  const yellow = new Map<string, Span[]>(), cautions = new Map<string, (Span & { text: string })[]>();
  const add = <T>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);
  for (const l of lines) {
    const pts = l.coords.map(toXY), mid = pointAt(pts, length(pts) / 2).p;
    const hit = nearestKerb(all, mid, (link) => link.halfWidth + KERB_NEAR_M);
    if (!hit) continue;
    const alongs = pts.map((p) => project(hit.link.line, p).along);
    add(yellow, kerbKey(hit.link, hit.offset > 0 ? "left" : "right"), { from: Math.min(...alongs), to: Math.max(...alongs) });
  }
  const busZones = placed.filter((p) => /Bus Zone/i.test(p.record.parkingrestrictiontype ?? ""));
  for (const n of nodesXY) {
    if (n.tags.highway === "bus_stop") {
      const hit = nearestKerb(all, n.p, (link) => link.halfWidth + KERB_NEAR_M);
      if (!hit) continue;
      const side: Side = hit.offset > 0 ? "left" : "right";
      if (busZones.some((b) => b.link === hit.link && b.side === side && Math.abs(b.along - hit.along) <= BUS_STOP.BUS_ZONE_NEAR_M)) continue;
      add(cautions, kerbKey(hit.link, side), { ...buffer(side, hit.along, BUS_STOP.BEFORE_M, BUS_STOP.AFTER_M),
        text: `Unsigned bus stop: no stopping ${BUS_STOP.BEFORE_M} m before it or ${BUS_STOP.AFTER_M} m after it (s 195)` });
    } else if (n.tags.highway === "crossing") {
      const hit = nearestKerb(all, n.p, (link) => link.halfWidth);
      if (!hit) continue;
      for (const side of SIDES) add(cautions, kerbKey(hit.link, side), { ...buffer(side, hit.along, CROSSING.BEFORE_M, CROSSING.AFTER_M),
        text: `Pedestrian crossing: if it's marked, no stopping ${CROSSING.BEFORE_M} m before it or ${CROSSING.AFTER_M} m after it (s 172)` });
    }
  }

  // An unpaired arrow runs on to the next intersection, or stops at a yellow line on the way.
  const signed = Map.groupBy(results.flatMap((r) => r.intervals), (i) => kerbKey(i.placed.link, i.placed.side));
  for (const [k, intervals] of signed) {
    const ys = yellow.get(k) ?? [];
    for (const i of intervals.filter((i) => i.lowConfidence)) {
      if (i.from === i.placed.along) i.to = Math.min(i.to, ...ys.filter((y) => y.from >= i.from).map((y) => y.from));
      else i.from = Math.max(i.from, ...ys.filter((y) => y.to <= i.to).map((y) => y.to));
    }
  }

  // Each kerb is cut where its rules, frontage or trims change; each piece is kept, trimmed or excluded.
  const suburbOf = suburbFinder(signs);
  const stretches: Stretch[] = [];
  let short = 0, parkingNoM = 0, noFrontageM = 0;
  const excludedM = { school: 0, kindergarten: 0 };
  for (const link of all) {
    for (const side of SIDES) {
      const k = kerbKey(link, side), intervals = signed.get(k) ?? [];
      const unsignedAllowed = !NO_UNSIGNED.HIGHWAYS.includes(link.highway) && !(NO_UNSIGNED.SLIP_ROADS && link.slip);
      if (!intervals.length && !unsignedAllowed) continue;
      const ys = yellow.get(k) ?? [];
      const noParking = link.segments.filter((s) => parkingNo(s.tags, s.reversed ? (side === "left" ? "right" : "left") : side));
      const setbacks: Span[] = [{ from: 0, to: link.setback.start[side] }, { from: link.length - link.setback.end[side], to: link.length }];
      const sign = side === "left" ? 1 : -1;
      const blocks = Math.max(1, Math.ceil(link.length / FRONTAGE.STEP_M));
      const blockAt = new Map<number, { frontage: Frontage | null; area?: string }>();
      const block = (s: number) => {
        const b = Math.min(blocks - 1, Math.floor(s / FRONTAGE.STEP_M));
        if (!blockAt.has(b)) {
          const { p, dir } = pointAt(link.line, Math.min(link.length, (b + 0.5) * FRONTAGE.STEP_M));
          const out: XY = [-dir[1] * sign, dir[0] * sign], kerbP: XY = [p[0] + out[0] * link.halfWidth, p[1] + out[1] * link.halfWidth];
          blockAt.set(b, { frontage: frontage.probe(kerbP, out), area: frontage.area(kerbP) });
        }
        return blockAt.get(b)!;
      };

      const cuts = [...new Set([
        0, link.length, ...intervals.flatMap((i) => [i.from, i.to]), ...ys.flatMap((y) => [y.from, y.to]),
        ...noParking.flatMap((s) => [s.from, s.to]), ...setbacks.flatMap((s) => [s.from, s.to]),
        ...Array.from({ length: blocks - 1 }, (_, b) => (b + 1) * FRONTAGE.STEP_M),
      ].filter((s) => s >= 0 && s <= link.length))].sort((a, b) => a - b);
      const pieces: { from: number; to: number; cover: Interval[]; at: ReturnType<typeof block> }[] = [];
      for (let c = 1; c < cuts.length; c++) {
        const from = cuts[c - 1]!, to = cuts[c]!, mid = (from + to) / 2;
        if (to - from < 0.01) continue;
        const cover = intervals.filter((i) => i.from <= from && i.to >= to);
        if (!cover.length && !unsignedAllowed) continue;
        // Hard trims, whatever the plates say: yellow lines, s 170 setbacks and OSM parking:*=no.
        if (within(ys, mid) || within(setbacks, mid)) continue;
        if (within(noParking, mid)) { parkingNoM += to - from; continue; }
        const at = block(mid);
        if (at.frontage?.excluded) { excludedM[at.frontage.excluded] += to - from; continue; }
        if (!at.frontage) noFrontageM += to - from;
        const last = pieces.at(-1);
        if (last && last.to === from && sameCover(last.cover, cover) && last.at.frontage === at.frontage && last.at.area === at.area) last.to = to;
        else pieces.push({ from, to, cover, at });
      }
      for (const piece of pieces) {
        if (piece.to - piece.from < MIN_STRETCH_M) { short++; continue; }
        const near = (cautions.get(k) ?? []).filter((c) => overlaps([c], piece.from, piece.to)).map((c) => c.text);
        stretches.push(stretch(link, side, piece, [...new Set(near)], suburbOf));
      }
    }
  }

  return {
    stretches,
    report: {
      areaPlates, paidAreaPlates, unsnapped, unarrowed, orphanRepeaters,
      orientation: { carriageway: round2(carriageway.share), footpath: round2(footpath.share), chosen, arrows: carriageway.arrows },
      unparsed: [...unparsed].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)),
      short,
      parkingNoM: Math.round(parkingNoM),
      excludedM: { school: Math.round(excludedM.school), kindergarten: Math.round(excludedM.kindergarten) },
      coverage: frontage.coverage(),
      noFrontageM: Math.round(noFrontageM),
    },
  };
}

/** OSM `parking:<side>=no` or `parking:both=no` (and the older `parking:lane:*` no-parking values) on one side of a way. */
function parkingNo(tags: Record<string, string>, side: Side): boolean {
  const no = (v?: string) => v === "no" || v === "no_parking" || v === "no_stopping";
  return tags[`parking:${side}`] === "no" || tags["parking:both"] === "no" || no(tags[`parking:lane:${side}`]) || no(tags["parking:lane:both"]);
}

/** The suburb of the nearest plate, for kerbs with none of their own. */
export function suburbFinder(signs: SignRecord[]) {
  const CELL = 300, grid = new Map<string, { p: XY; suburb: string }[]>();
  for (const s of signs) {
    const p = toXY([s.lon, s.lat]), k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
    grid.set(k, [...(grid.get(k) ?? []), { p, suburb: s.suburb ?? "" }]);
  }
  return (p: XY): string => {
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
    let best: { d: number; suburb: string } | undefined;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const s of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const d = dist(p, s.p);
        if (!best || d < best.d) best = { d, suburb: s.suburb };
      }
    return titleCase(best?.suburb ?? "");
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

const dedupe = (rules: Rule[]) => [...new Map(rules.map((r) => [JSON.stringify(r), r])).values()];

function stretch(link: Link, side: Side, piece: { from: number; to: number; cover: Interval[]; at: { frontage: Frontage | null; area?: string } },
  cautions: string[], suburbOf: (p: XY) => string): Stretch {
  const { from, to, cover, at } = piece;
  const centre = slice(link.line, from, to);
  const kerb = offset(centre, side === "left" ? link.halfWidth : -link.halfWidth);
  const plates = cover.map((i) => i.placed.plate);
  const record = cover[0]?.placed.record;
  // A kerb in the St Lucia Traffic Area takes the area's rule alongside its plates', and the timetable
  // resolves them to the most restrictive at each moment.
  const area: Rule[] = at.area === ST_LUCIA_TRAFFIC_AREA.NAME ? [{ ...ST_LUCIA_TRAFFIC_AREA.RULE }] : [];
  const lowConfidence = cover.some((i) => i.lowConfidence);
  return {
    link, side, from, to,
    compass: compassSide(centre, side),
    line: kerb.map(toLonLat),
    street: link.name || titleCase(record?.street ?? ""),
    suburb: record ? titleCase(record.suburb ?? "") : suburbOf(pointAt(kerb, (to - from) / 2).p),
    plates: [...new Set([...plates.map((p) => p.label), ...area.map((r) => r.label)])],
    rules: dedupe([...plates.flatMap((p) => p.rules), ...area]),
    lenientRules: dedupe([...plates.filter((p) => !p.unparsed).flatMap((p) => p.rules), ...area]),
    unparsed: [...new Set(plates.flatMap((p) => (p.unparsed ? [p.unparsed] : [])))],
    cautions: [...(lowConfidence ? ["Low-confidence stretch"] : []), ...cautions],
    lowConfidence,
    signed: cover.length > 0,
    frontage: at.frontage,
  };
}
