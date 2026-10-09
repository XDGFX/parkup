// Unsigned kerbs, trims, cautions, the St Lucia Traffic Area, unreadable plates and frontage, through the build seam.
import { describe, expect, it } from "vitest";
import { build, type BuildInput, type Candidate } from "../src/build/build.ts";
import { node, testStreet, way } from "./fixtures.ts";

const R = 6371008.8, RAD = Math.PI / 180;
const yOf = ([, lat]: [number, number]) => (lat + 27.5) * R * RAD;
/** The candidate's extent along Test Street, as [north y, south y], rounded to the metre. */
const extent = (c: Candidate) => {
  const ys = [yOf(c.line[0]!), yOf(c.line.at(-1)!)].map(Math.round);
  return [Math.max(...ys), Math.min(...ys)];
};
const run = (input: Partial<BuildInput>) => build({ signs: [], ways: testStreet, ...input });
const onTest = (cs: Candidate[], side: "west" | "east" = "west") => cs.filter((c) => c.street === "Test Street" && c.side === side);
/** Test Street's candidates on one side, as extents from north to south. */
const kerb = (input: Partial<BuildInput>, side: "west" | "east" = "west") => onTest(run(input).candidates, side).map(extent).sort((a, b) => b[0]! - a[0]!);

describe("unsigned kerbs", () => {
  it("run from intersection to intersection, set back 10 m from the kerb of the crossing road (s 170)", () => {
    // Top Road and Bottom Road are residential, so their kerbs are 4 m from the centreline.
    const west = onTest(run({}).candidates);
    expect(west.map(extent)).toEqual([[-14, -186]]);
    expect(west[0]).toMatchObject({ rules: [], plates: [], overnight: true, daytime: true, lowConfidence: false });
  });

  it("are set back 20 m where the intersection has traffic lights", () => {
    expect(kerb({ nodes: [node(900, 0, -195, { highway: "traffic_signals" })] })).toEqual([[-14, -176]]);
  });

  it("aren't set back along the continuous side of a T-intersection without lights", () => {
    // Top Road's north kerb faces away from Test Street, so it runs right through the T.
    const { candidates } = run({});
    const lengths = (side: string) => candidates.filter((c) => c.street === "Top Road" && c.side === side).map((c) => Math.round(c.lengthM));
    expect(lengths("north")).toEqual([100, 100]);
    expect(lengths("south")).toEqual([86, 86]);
  });

  it("are left off motorways and slip roads", () => {
    const ways = [way(5, "Fast Way", [50, 51], [[0, 0], [0, -200]], "motorway"), way(6, "Slip", [60, 61], [[50, 0], [50, -200]], "primary_link")];
    expect(run({ ways }).candidates).toEqual([]);
  });
});
