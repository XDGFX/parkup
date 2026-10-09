// Sites (parking areas and off-road sites): generators, rule-outs, timetables, tier and tenure, through the build seam.
import { describe, expect, it } from "vitest";
import { build, type BuildInput, type Candidate } from "../src/build/build.ts";
import type { OsmArea, Parcel, TrailLine } from "../src/build/inputs.ts";
import { outBy, statusAt } from "../src/timetable/timetable.ts";
import { lonLat, node, sign, testStreet, way, zone } from "./fixtures.ts";

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

describe("site timetables", () => {
  const monday = (h: number) => new Date(`2026-03-02T${String(h).padStart(2, "0")}:00:00+10:00`);
  const site = (tags: Record<string, string>, input: Partial<BuildInput> = {}) => sites({ parkings: [carPark({ access: "yes", ...tags })], ...input })[0];

  it("OSM opening_hours: closed hours count as no parking", () => {
    const c = site({ opening_hours: "Mo-Su 06:00-18:00" })!;
    expect(c).toMatchObject({ overnight: false, daytime: true, dayOnly: true, cautions: [] });
    expect(outBy(c, monday(17))).toMatchObject({ at: monday(18) });
    expect(outBy(c, monday(17))!.why).toMatch(/Closed/);
  });

  it("reads days, several rules, off days, and hours past midnight", () => {
    const weekdays = site({ opening_hours: "Mo-Fr 07:00-19:00; Sa,Su off" })!;
    expect(outBy(weekdays, monday(8))).toMatchObject({ at: monday(19) });
    expect(statusAt(weekdays, new Date("2026-03-07T12:00:00+10:00"))).toBe("no");
    const late = site({ opening_hours: "Mo-Su 05:00-02:00" })!;
    expect(outBy(late, monday(20))).toMatchObject({ at: new Date("2026-03-03T02:00:00+10:00") });
    expect(site({ opening_hours: "24/7" })).toMatchObject({ rules: [], overnight: true, cautions: [] });
  });

  it("a car park that's always closed is dropped", () => {
    expect(site({ opening_hours: "off" })).toBeUndefined();
  });

  it("unreadable opening_hours: open, with a caution quoting the tag", () => {
    expect(site({ opening_hours: "Mo-Fr 08:00-17:00 \"by appointment\"" })).toMatchObject({ rules: [], cautions: ["Opening hours not read: Mo-Fr 08:00-17:00 \"by appointment\""] });
  });

  it("OSM maxstay is a time limit at all times", () => {
    expect(site({ maxstay: "4 hours" })).toMatchObject({ maxStayHours: 4, overnight: false, daytime: true, cautions: [] });
    expect(site({ maxstay: "30 minutes" })).toBeUndefined();
  });

  it("OSM fee:conditional counts as no parking while the fee applies", () => {
    const c = site({ "fee:conditional": "yes @ (Mo-Fr 08:00-18:00)" })!;
    expect(c).toMatchObject({ overnight: true, cautions: [] });
    expect(outBy(c, monday(19))).toMatchObject({ at: new Date("2026-03-03T08:00:00+10:00") });
    expect(outBy(c, monday(19))!.why).toMatch(/[Ff]ee/);
  });

  it("BCC plates inside the outline govern the site", () => {
    const plate = sign({ x: 40, y: -70, dir: "Not applicable", type: "No Parking Specified Times", times: "DAILY:10pm-6am", street: "GARDEN CAR PARK" });
    const c = site({}, { signs: [plate] })!;
    expect(c.plates).toEqual(["No Parking DAILY:10pm-6am"]);
    expect(c).toMatchObject({ overnight: false, daytime: true, cautions: [] });
  });
});

/** A site's single point as metres around the fixtures' origin, to the nearest metre. */
const R = 6371008.8, RAD = Math.PI / 180;
const xy = (c: Candidate) => { const [lon, lat] = c.line[0]!; return [Math.round((lon - 153) * R * RAD * Math.cos(-27.5 * RAD)), Math.round((lat + 27.5) * R * RAD)]; };
const track = (id: number, nodes: number[], pts: [number, number][], tags: Record<string, string> = {}) => {
  const w = way(id, "", nodes, pts, "track");
  return { ...w, tags: { highway: "track", ...tags } };
};
/** A 120 m track leaving Bottom Road at its east end (node 21) and running south. */
const southTrack = (tags: Record<string, string> = {}) => track(70, [21, 71, 72], [[100, -200], [100, -260], [100, -320]], tags);
const offRoad = (input: Partial<BuildInput>) => sites(input).map((c) => [c.id, xy(c)]);

describe("off-road sites", () => {
  it("go where an OSM track leaves a public road, and at its far end", () => {
    const found = sites({ minorWays: [southTrack()] });
    expect(found.map((c) => [c.id, c.kind, xy(c)])).toEqual([
      ["osm-track-70-21", "off-road", [100, -220]],
      ["osm-track-70-72-end", "off-road", [100, -320]],
    ]);
    expect(found[0]).toMatchObject({ street: "Track off Bottom Road", line: [expect.any(Array)], cautions: ["Hours unknown"], overnight: true });
  });

  it("follow the track network from the road, but not past a mapped barrier unless it's locked=no", () => {
    const onward = track(73, [72, 74], [[100, -320], [160, -320]]);
    expect(offRoad({ minorWays: [southTrack(), onward] }).map(([id]) => id)).toEqual(["osm-track-70-21", "osm-track-73-74-end"]);
    // A gate 60 m in: the entry is reachable, the far end isn't.
    expect(offRoad({ minorWays: [southTrack()], nodes: [node(71, 100, -260, { barrier: "gate" })] }).map(([id]) => id)).toEqual(["osm-track-70-21"]);
    expect(offRoad({ minorWays: [southTrack()], nodes: [node(71, 100, -260, { barrier: "gate", locked: "no" })] })).toHaveLength(2);
    // A gate where the track leaves the road shuts the lot.
    expect(offRoad({ minorWays: [southTrack()], nodes: [node(21, 100, -200, { barrier: "lift_gate" })] })).toEqual([]);
  });

  it("aren't reached along a track tagged access or motor_vehicle no|private", () => {
    for (const tags of [{ access: "private" }, { access: "no" }, { motor_vehicle: "no" }, { motor_vehicle: "private" }] as Record<string, string>[])
      expect(offRoad({ minorWays: [southTrack(tags)] })).toEqual([]);
  });

  it("are reached from service roads, but not driveways; an untagged service road is never a site itself", () => {
    // A service road north from Top Road's east end (node 11), and a track off its end.
    const service = (tags: Record<string, string>) => ({ ...way(80, "", [11, 81], [[100, 0], [100, 50]], "service"), tags: { highway: "service", ...tags } });
    const north = track(82, [81, 83], [[100, 50], [100, 150]]);
    expect(offRoad({ minorWays: [service({})] })).toEqual([]);
    expect(offRoad({ minorWays: [service({}), north] }).map(([id]) => id)).toEqual(["osm-track-82-81", "osm-track-82-83-end"]);
    expect(offRoad({ minorWays: [service({ service: "driveway" }), north] })).toEqual([]);
  });

  it("carry QLD Roads and Tracks trafficability where a segment matches", () => {
    const qld = [{ trafficability: "4WD", surface: "Unsealed", coords: [lonLat(103, -205), lonLat(103, -330)] }];
    expect(sites({ minorWays: [southTrack()], qldTracks: qld }).map((c) => c.trafficability)).toEqual(["4WD", "4WD"]);
    const far = [{ trafficability: "4WD", surface: "Unsealed", coords: [lonLat(160, -205), lonLat(160, -330)] }];
    expect(sites({ minorWays: [southTrack()], qldTracks: far }).map((c) => c.trafficability)).toEqual([null, null]);
  });
});

describe("build report", () => {
  it("counts sites by kind, those with any timetable data, and those failing the screen", () => {
    const parkings = [carPark({ access: "yes" }, 1), carPark({ access: "yes", opening_hours: "Mo-Su 06:00-20:00" }, 2), carPark({ access: "yes", maxstay: "1 hour" }, 3)];
    expect(run({ parkings, minorWays: [southTrack()] }).report.sites).toEqual({ parkingAreas: 2, offRoad: 2, withTimetable: 1, failsScreen: 1 });
  });
});

describe("tenure label", () => {
  // The car park's point is the middle of its outline, (40, -70).
  const parcel = (tenure: string | null, parcelType: string | null = "Lot Type Parcel"): Parcel => {
    const [lon, lat] = lonLat(40, -70);
    return { lon, lat, lotplan: "1RP000", tenure, parcelType };
  };
  const tenureOf = (input: Partial<BuildInput>) => sites({ parkings: [carPark({ access: "yes" })], ...input })[0]!.tenure;

  it("labels a site from the QLD cadastre parcel at its point", () => {
    expect(tenureOf({ parcels: [parcel("Freehold")] })).toBe("Freehold (owner unknown)");
    expect(tenureOf({ parcels: [parcel("Reserve")] })).toBe("Public: reserve");
    expect(tenureOf({ parcels: [parcel("National Park")] })).toBe("Public: national park");
    expect(tenureOf({ parcels: [parcel("State Forest")] })).toBe("Public: state forest");
    expect(tenureOf({ parcels: [parcel(null, "Road Type Parcel")] })).toBe("Public: road reserve");
    expect(tenureOf({})).toBeNull();
  });

  it("council land from BCC Council Vegetation overrides freehold, and it never filters", () => {
    const councilLand = [{ rings: ring(0, 0, 100, -200) }];
    expect(tenureOf({ parcels: [parcel("Freehold")], councilLand })).toBe("Public: council land");
    expect(run({ parcels: [parcel("Freehold")] }).candidates.filter((c) => c.kind === "kerb").every((c) => c.tenure === null)).toBe(true);
  });
});

describe("BCC Tracks and Trails access lines", () => {
  /** A BCC line running south from just off Bottom Road at x. */
  const trail = (id: string, itemType: string, x = -50, description: string | null = null): TrailLine =>
    ({ id, itemType, park: "Test Park", description, coords: [lonLat(x, -205), lonLat(x, -300)] });

  it("ACCESS ROAD and MULTI-USE ACCESS lines missing from OSM give a site in from the road end", () => {
    const found = sites({ trails: [trail("1", "ACCESS ROAD"), trail("2", "MULTI-USE ACCESS", -20), trail("3", "WALKING TRACK", 20)] });
    expect(found.map((c) => [c.id, c.kind, c.street, xy(c)])).toEqual([
      ["bcc-trail-1", "off-road", "Test Park access road", [-50, -225]],
      ["bcc-trail-2", "off-road", "Test Park access road", [-20, -225]],
    ]);
  });

  it("are left out where OSM already maps the track", () => {
    const mapped = track(90, [20, 91], [[-100, -200], [-52, -300]]);
    expect(sites({ trails: [trail("1", "ACCESS ROAD")], minorWays: [mapped] }).map((c) => c.id)).not.toContain("bcc-trail-1");
  });

  it("management access only is a caution", () => {
    expect(sites({ trails: [trail("1", "ACCESS ROAD", -50, "MANAGEMENT ACCESS ONLY")] })[0]!.cautions).toEqual(["Management access only", "Hours unknown"]);
  });
});
