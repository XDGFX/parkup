// Flat geometry in metres. The three suburbs span a few kilometres, so a local equirectangular
// projection around Brisbane is accurate to well under the few metres OSM itself is good to.

export type LonLat = [lon: number, lat: number];
export type XY = [x: number, y: number];
export type Compass = "north" | "south" | "east" | "west";

const R = 6371008.8, RAD = Math.PI / 180, LAT0 = -27.5, LON0 = 153.0;
const KX = R * RAD * Math.cos(LAT0 * RAD), KY = R * RAD;

export const toXY = ([lon, lat]: LonLat): XY => [(lon - LON0) * KX, (lat - LAT0) * KY];
// Six decimal places is about 10 cm, plenty for a kerb and much smaller in the dataset.
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
export const toLonLat = ([x, y]: XY): LonLat => [round6(LON0 + x / KX), round6(LAT0 + y / KY)];

export const dist = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function length(line: XY[]): number {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += dist(line[i - 1]!, line[i]!);
  return m;
}

/**
 * Where `p` falls on `line`: the distance along it, and the signed distance from it
 * (positive on the left of the line's direction, negative on the right).
 */
export function project(line: XY[], p: XY): { along: number; offset: number } {
  let best = { along: 0, offset: Infinity }, run = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (!len) continue;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len ** 2));
    const q: XY = [a[0] + t * dx, a[1] + t * dy], d = dist(p, q);
    if (d < Math.abs(best.offset)) {
      const cross = dx * (p[1] - a[1]) - dy * (p[0] - a[0]);
      best = { along: run + t * len, offset: cross >= 0 ? d : -d };
    }
    run += len;
  }
  return best;
}

/** The part of `line` between two distances along it. */
export function slice(line: XY[], from: number, to: number): XY[] {
  const out: XY[] = [];
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!, len = dist(a, b);
    const at = (s: number): XY => { const t = len ? (s - run) / len : 0; return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
    if (run + len >= from && run <= to) {
      if (!out.length) out.push(at(Math.max(from, run)));
      out.push(at(Math.min(to, run + len)));
    }
    run += len;
  }
  return out;
}

/** `line` moved sideways by `d` metres: positive to the left of its direction, negative to the right. */
export function offset(line: XY[], d: number): XY[] {
  const normal = (a: XY, b: XY): XY => { const len = dist(a, b) || 1; return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len]; };
  return line.map((p, i) => {
    const n1 = i > 0 ? normal(line[i - 1]!, p) : normal(p, line[i + 1]!);
    const n2 = i < line.length - 1 ? normal(p, line[i + 1]!) : n1;
    // Mitre the corner, capped so a sharp bend doesn't throw the kerb far out.
    const m: XY = [n1[0] + n2[0], n1[1] + n2[1]], mlen = Math.hypot(...m) || 1;
    const scale = Math.min(2, 1 / Math.max(0.5, (m[0] * n1[0] + m[1] * n1[1]) / mlen));
    return [p[0] + (m[0] / mlen) * d * scale, p[1] + (m[1] / mlen) * d * scale];
  });
}

/** The compass side a kerb is on: the direction from the centreline to the kerb. */
export function compassSide(line: XY[], side: "left" | "right"): Compass {
  const a = line[0]!, b = line.at(-1)!;
  let [nx, ny] = [-(b[1] - a[1]), b[0] - a[0]];
  if (side === "right") [nx, ny] = [-nx, -ny];
  if (Math.abs(nx) > Math.abs(ny)) return nx > 0 ? "east" : "west";
  return ny > 0 ? "north" : "south";
}

/** The point `s` metres along `line`, and the unit direction of the line there. */
export function pointAt(line: XY[], s: number): { p: XY; dir: XY } {
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!, len = dist(a, b);
    if (!len) continue;
    if (run + len >= s || i === line.length - 1) {
      const t = Math.max(0, Math.min(1, (s - run) / len));
      return { p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
    }
    run += len;
  }
  return { p: line[0]!, dir: [1, 0] };
}

/** Whether `p` is inside a polygon given as rings (the first the outline, the rest holes), by the even-odd rule. */
export function inRings(rings: XY[][], p: XY): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** A candidate's geometry by shape: a single point, a closed ring (a car park's outline), or an open line (a kerb). */
export type Shape = "point" | "ring" | "line";

export function shapeOf(line: readonly (readonly [number, number])[]): Shape {
  if (line.length < 2) return "point";
  const a = line[0]!, b = line.at(-1)!;
  return line.length >= 4 && a[0] === b[0] && a[1] === b[1] ? "ring" : "line";
}

/** The middle of a ring, or of any points, as the mean of its corners (a ring's closing corner counted once). */
export function centreOf<T extends [number, number]>(pts: T[]): T {
  const corners = shapeOf(pts) === "ring" ? pts.slice(0, -1) : pts;
  return [corners.reduce((s, p) => s + p[0], 0) / corners.length, corners.reduce((s, p) => s + p[1], 0) / corners.length] as T;
}
