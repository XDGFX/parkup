// Frontage: the City Plan zone a kerb faces, found by probing outward from the kerb across the unzoned road reserve.
// Also the permit areas a kerb lies in, and the frontage exclusions (schools and kindergartens).
import { EXCLUDED, FRONTAGE, OTHER_TIER, TIERS } from "./config.ts";
import { inRings, toXY, type XY } from "./geo.ts";
import type { OsmNode, PermitArea, Zone } from "./inputs.ts";

export type Frontage = { zone: string; name: string; tier: 1 | 2 | 3; excluded?: "school" | "kindergarten" };

type Shape<T> = { rings: XY[][]; box: [number, number, number, number]; value: T };
const CELL = 200;

/** A grid of polygon bounding boxes, so a point lookup only tests the polygons near it. */
class PolygonIndex<T> {
  private cells = new Map<string, Shape<T>[]>();
  constructor(items: { rings: [number, number][][]; value: T }[]) {
    for (const { rings, value } of items) {
      const xy = rings.map((r) => r.map(toXY));
      const xs = xy[0]!.map((p) => p[0]), ys = xy[0]!.map((p) => p[1]);
      const box: Shape<T>["box"] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const shape = { rings: xy, box, value };
      for (let cx = Math.floor(box[0] / CELL); cx <= Math.floor(box[2] / CELL); cx++)
        for (let cy = Math.floor(box[1] / CELL); cy <= Math.floor(box[3] / CELL); cy++) {
          const k = `${cx},${cy}`;
          this.cells.set(k, [...(this.cells.get(k) ?? []), shape]);
        }
    }
  }
  at(p: XY): T | undefined {
    const shapes = this.cells.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? [];
    return shapes.find((s) => p[0] >= s.box[0] && p[0] <= s.box[2] && p[1] >= s.box[1] && p[1] <= s.box[3] && inRings(s.rings, p))?.value;
  }
}

/** The tier for a zone or precinct code: in full ("CF4", "SC1"), else by its letters ("OS2" → "OS"). */
export function tierOf(code: string): 1 | 2 | 3 {
  return TIERS[code] ?? TIERS[code.replace(/\d+$/, "")] ?? OTHER_TIER;
}

export type FrontageCoverage = {
  schools: { mapped: number; inExcludedZone: number };
  kindergartens: { mapped: number; inExcludedZone: number };
};

export function frontageIndex(zones: Zone[], areas: PermitArea[], nodes: OsmNode[]) {
  const pois = nodes.filter((n) => n.tags.amenity).map((n) => ({ amenity: n.tags.amenity!, p: toXY([n.lon, n.lat]) }));
  const kindergartens = pois.filter((p) => EXCLUDED.KINDERGARTEN.test(p.amenity));
  const frontages = zones.map((z) => {
    const xy = z.rings.map((r) => r.map(toXY));
    const f: Frontage = { zone: z.code, name: z.name, tier: tierOf(z.code) };
    if (EXCLUDED.ZONES.includes(z.code)) f.excluded = "school";
    else if (EXCLUDED.KINDERGARTEN_ZONES.includes(z.code) && kindergartens.some((k) => inRings(xy, k.p))) f.excluded = "kindergarten";
    return { rings: z.rings, value: f };
  });
  const zoneIndex = new PolygonIndex(frontages);
  const areaIndex = new PolygonIndex(areas.map((a) => ({ rings: a.rings, value: a.name })));
  const inExcluded = (p: XY) => !!zoneIndex.at(p)?.excluded;
  const schools = pois.filter((p) => p.amenity === "school");

  return {
    /** The first zone met walking `outward` from the kerb point `p`, or null if none within the probe distance. */
    probe(p: XY, outward: XY): Frontage | null {
      for (let d = 0; d <= FRONTAGE.PROBE_M; d += FRONTAGE.PROBE_STEP_M) {
        const f = zoneIndex.at([p[0] + outward[0] * d, p[1] + outward[1] * d]);
        if (f) return f;
      }
      return null;
    },
    /** The zone the point sits in, for a site. */
    at: (p: XY): Frontage | null => zoneIndex.at(p) ?? null,
    /** The permit area the point is in, if any. */
    area: (p: XY) => areaIndex.at(p),
    /** How many mapped schools and kindergartens fall in a zone the build excludes. */
    coverage: (): FrontageCoverage => ({
      schools: { mapped: schools.length, inExcludedZone: schools.filter((s) => inExcluded(s.p)).length },
      kindergartens: { mapped: kindergartens.length, inExcludedZone: kindergartens.filter((k) => inExcluded(k.p)).length },
    }),
  };
}
