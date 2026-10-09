import { describe, expect, it } from "vitest";
import { build } from "../src/build/build.ts";
import type { ToiletRecord } from "../src/build/inputs.ts";
import { lonLat, testStreet, westPair } from "./fixtures.ts";

const toilet = (id: string, x: number, y: number, openinghours: string | null = "OPEN: 24 hours"): ToiletRecord => {
  const [lon, lat] = lonLat(x, y);
  return { facilityid: id, name: `Toilet ${id}`, facilitytype: "Park or reserve", address: `${id} Test Street`, lon, lat, openinghours };
};
// The west kerb of Test Street from y = -20 to y = -80, at x = -4.
const signs = westPair(-20, -80, "No Parking Specified Times", "MON-FRI:7am-6pm");

describe("nearest toilet", () => {
  it("each candidate carries its nearest toilet, measured from the nearest point of its kerb", () => {
    // A is 300 m from the kerb's north end; B is 150 m west of its south end.
    const toilets = [toilet("A", -4, 280), toilet("B", -154, -80, "OPEN: Daylight hours"), toilet("C", 900, -900)];
    const candidates = build({ signs, ways: testStreet, toilets }).candidates.filter((c) => c.plates.length);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.toilet).toEqual({ id: "B", name: "Toilet B", distanceM: 150 });
  });

  it("the toilets layer carries parsed hours, and leaves out toilets far from every candidate", () => {
    const toilets = [toilet("B", -154, -80, "OPEN: Daylight hours"), toilet("V", 100, 100, "OPEN: Venue hours"), toilet("Far", 20000, 0)];
    const { toilets: layer } = build({ signs, ways: testStreet, toilets });
    expect(layer.map((t) => t.id)).toEqual(["B", "V"]);
    expect(layer[0]!.hours).toEqual({ text: "OPEN: Daylight hours", open: [{ days: [1, 2, 3, 4, 5, 6, 7], start: 6, end: 18 }] });
    expect(layer[1]!.hours).toEqual({ text: "OPEN: Venue hours", open: null });
  });

  it("no toilets in, no toilet on the card", () => {
    expect(build({ signs, ways: testStreet }).candidates[0]!.toilet).toBeNull();
  });
});
