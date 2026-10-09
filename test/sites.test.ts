// Sites (parking areas and off-road sites): generators, rule-outs, timetables, tier and tenure, through the build seam.
import { describe, expect, it } from "vitest";
import { build, type BuildInput, type Candidate } from "../src/build/build.ts";
import type { OsmArea } from "../src/build/inputs.ts";
import { lonLat, node, testStreet, way, zone } from "./fixtures.ts";

const run = (input: Partial<BuildInput>) => build({ signs: [], ways: testStreet, ...input });
const sites = (input: Partial<BuildInput>) => run(input).candidates.filter((c) => c.kind !== "kerb");

const ring = (x0: number, y0: number, x1: number, y1: number) => [[lonLat(x0, y0), lonLat(x1, y0), lonLat(x1, y1), lonLat(x0, y1), lonLat(x0, y0)]];
/** An OSM car park east of Test Street, covering x 20 to 60 and y -50 to -90. */
const carPark = (tags: Record<string, string> = {}, id = 500): OsmArea =>
  ({ type: "way", id, tags: { amenity: "parking", ...tags }, rings: ring(20, -50, 60, -90) });

describe("parking areas", () => {
  it("come from OSM car parks, open at all times with an hours-unknown caution when nothing says otherwise", () => {
    const [site, ...rest] = sites({ parkings: [carPark({ access: "yes", name: "Garden Car Park" })] });
    expect(rest).toEqual([]);
    expect(site).toMatchObject({
      id: "osm-way-500", kind: "parking-area", street: "Garden Car Park", rules: [], plates: [],
      overnight: true, daytime: true, dayOnly: false, cautions: ["Hours unknown"],
    } satisfies Partial<Candidate>);
    expect(site!.line).toHaveLength(5);
  });

  it("an untagged car park gets an access-unknown caution and orders after access=yes|permissive", () => {
    const parkings = [carPark({}, 501), carPark({ access: "permissive" }, 502), carPark({ access: "yes" }, 503)];
    const found = sites({ parkings });
    expect(found.map((c) => c.id)).toEqual(["osm-way-502", "osm-way-503", "osm-way-501"]);
    expect(found[2]!.cautions).toEqual(["Access unknown", "Hours unknown"]);
  });

  it("are ruled out by access=private|customers|no|permit or fee=yes, and off-street only", () => {
    const ruledOut: Record<string, string>[] = [{ access: "private" }, { access: "customers" }, { access: "no" }, { access: "permit" }, { fee: "yes" }, { parking: "street_side" }];
    expect(sites({ parkings: ruledOut.map((t, i) => carPark(t, 510 + i)) })).toEqual([]);
    expect(sites({ parkings: [carPark({ fee: "no" })] })).toHaveLength(1);
  });

  it("are ruled out by a mapped gate, lift gate or bollard on the only access way, unless it's locked=no", () => {
    // A service way from Test Street into the car park, with a barrier 10 m along it.
    const aisle = (id: number, y: number) => ({ ...way(id, "", [id * 10, id * 10 + 1, id * 10 + 2], [[0, y], [10, y], [30, y]], "service"), tags: { highway: "service" } });
    const barrier = (wayId: number, tags: Record<string, string>) => node(wayId * 10 + 1, 10, -70, tags);
    const withGate = (tags: Record<string, string>) => sites({ parkings: [carPark({ access: "yes" })], minorWays: [aisle(60, -70)], nodes: [barrier(60, tags)] });
    expect(withGate({ barrier: "gate" })).toEqual([]);
    expect(withGate({ barrier: "lift_gate" })).toEqual([]);
    expect(withGate({ barrier: "bollard" })).toEqual([]);
    expect(withGate({ barrier: "gate", locked: "no" })).toHaveLength(1);
    // A second, open way in keeps it.
    expect(sites({ parkings: [carPark({ access: "yes" })], minorWays: [aisle(60, -70), aisle(61, -80)], nodes: [barrier(60, { barrier: "gate" })] })).toHaveLength(1);
  });

  it("take their tier from the zone they sit in, with no boost over kerbs", () => {
    const [site] = sites({ parkings: [carPark({ access: "yes" })], zones: [zone("OS2", 10, 0, 100, -200)] });
    expect(site).toMatchObject({ tier: 1, frontage: { zone: "OS2", name: "OS2" } });
    expect(sites({ parkings: [carPark({ access: "yes" })], zones: [zone("LMR2", 10, 0, 100, -200)] })[0]!.tier).toBe(2);
    // The kerbs facing the same zone sort alongside the site, by name.
    const { candidates } = run({ parkings: [carPark({ access: "yes", name: "Aa Car Park" })], zones: [zone("OS2", 10, 0, 100, -200)] });
    expect(candidates.map((c) => c.street)[0]).toBe("Aa Car Park");
    expect(new Set(candidates.filter((c) => c.tier === 1).map((c) => c.street))).toEqual(new Set(["Aa Car Park", "Bottom Road", "Test Street", "Top Road"]));
  });

  it("are ruled out at schools and kindergartens", () => {
    expect(sites({ parkings: [carPark({ access: "yes" })], zones: [zone("CF5", 10, 0, 100, -200)] })).toEqual([]);
    const cf4 = [zone("CF4", 10, 0, 100, -200)];
    expect(sites({ parkings: [carPark({ access: "yes" })], zones: cf4, nodes: [node(800, 80, -150, { amenity: "kindergarten" })] })).toEqual([]);
    expect(sites({ parkings: [carPark({ access: "yes" })], zones: cf4 })).toHaveLength(1);
    // A school mapped inside the car park's outline, whatever the zone.
    expect(sites({ parkings: [carPark({ access: "yes" })], nodes: [node(801, 40, -70, { amenity: "school" })] })).toEqual([]);
  });

  it("motor_vehicle=private is a caution, not a rule-out", () => {
    expect(sites({ parkings: [carPark({ access: "yes", motor_vehicle: "private" })] })[0]!.cautions).toContain("Motor vehicles: private");
  });
});
