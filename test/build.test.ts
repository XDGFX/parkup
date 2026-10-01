import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { build, type Candidate } from "../src/build/build.ts";
import type { OsmWay, SignRecord } from "../src/build/inputs.ts";
import { outBy } from "../src/timetable/timetable.ts";
import { eastPair, sign, testStreet, westPair } from "./fixtures.ts";

const R = 6371008.8, RAD = Math.PI / 180;
const yOf = ([, lat]: [number, number]) => (lat + 27.5) * R * RAD;
/** The candidate's extent along Test Street, as [north y, south y], rounded to the metre. */
const extent = (c: Candidate) => {
  const ys = [yOf(c.line[0]!), yOf(c.line.at(-1)!)].map(Math.round);
  return [Math.max(...ys), Math.min(...ys)];
};
const run = (signs: SignRecord[], ways: OsmWay[] = testStreet) => build({ signs, ways });
const NP = "No Parking Specified Times";
const at = (s: string) => new Date(`${s}+10:00`);

describe("pairing opposite arrows (s 332)", () => {
  it("a Left and a Right plate on the west kerb make one stretch between them", () => {
    const { candidates } = run(westPair(-20, -80, NP, "MON-FRI:7am-6pm"));
    expect(candidates).toHaveLength(1);
    const [c] = candidates;
    expect(c!.street).toBe("Test Street");
    expect(c!.side).toBe("west");
    expect(extent(c!)).toEqual([-20, -80]);
    expect(c!.lengthM).toBeCloseTo(60, 0);
    expect(c!.lowConfidence).toBe(false);
    expect(c!.rules).toEqual([{ kind: "no", days: [1, 2, 3, 4, 5], start: 7, end: 18, label: "No Parking MON-FRI:7am-6pm" }]);
    expect(c!.plates).toEqual(["No Parking MON-FRI:7am-6pm"]);
  });

  it("pairs on the east kerb, where the arrows point the other way", () => {
    const { candidates } = run(eastPair(-20, -80, NP, "MON-FRI:7am-6pm"));
    expect(candidates.map((c) => [c.side, extent(c)])).toEqual([["east", [-20, -80]]]);
  });

  it("keeps each kerb's plates to its own side", () => {
    const { candidates } = run([...westPair(-20, -80, NP, "MON-FRI:7am-6pm"), ...eastPair(-100, -150, NP, "MON-FRI:7am-6pm")]);
    expect(candidates.map((c) => [c.side, extent(c)]).sort()).toEqual([["east", [-100, -150]], ["west", [-20, -80]]]);
  });

  it("Bi-Directional plates are repeaters: they neither start nor end a stretch", () => {
    const signs = [...westPair(-20, -80, NP, "MON-FRI:7am-6pm"), sign({ x: -4, y: -50, dir: "Bi-Directional", type: NP, times: "MON-FRI:7am-6pm" })];
    const { candidates } = run(signs);
    expect(candidates.map(extent)).toEqual([[-20, -80]]);
  });

  it("an unpaired arrow runs to the next intersection and is flagged low confidence", () => {
    const { candidates } = run([sign({ x: -4, y: -120, dir: "Left", type: NP, times: "MON-FRI:7am-6pm" })]);
    expect(candidates).toHaveLength(1);
    expect(extent(candidates[0]!)).toEqual([-120, -200]);
    expect(candidates[0]!.lowConfidence).toBe(true);
    expect(candidates[0]!.cautions).toContain("Low-confidence stretch");
  });

  it("an unpaired arrow pointing back runs to the intersection behind it", () => {
    const { candidates } = run([sign({ x: -4, y: -50, dir: "Right", type: NP, times: "MON-FRI:7am-6pm" })]);
    expect(candidates.map(extent)).toEqual([[0, -50]]);
  });

  it("only pairs plates with the same restriction", () => {
    const signs = [
      sign({ x: -4, y: -20, dir: "Left", type: NP, times: "MON-FRI:7am-6pm" }),
      sign({ x: -4, y: -60, dir: "Right", type: "2P Parallel", times: "MON-FRI:7am-6pm" }),
    ];
    // The No Parking plate runs on to Bottom Road; the 2P plate runs back to Top Road.
    const { candidates } = run(signs);
    expect(candidates.every((c) => c.lowConfidence)).toBe(true);
  });

  it("snaps a plate to the street it names, not just the nearest centreline", () => {
    // 3 m south of Top Road and 8 m west of Test Street: nearer Top Road's centreline.
    const signs = [
      sign({ x: -8, y: -3, dir: "Left", type: NP, times: "MON-FRI:7am-6pm" }),
      sign({ x: -4, y: -60, dir: "Right", type: NP, times: "MON-FRI:7am-6pm" }),
    ];
    expect(run(signs).candidates.map((c) => [c.street, extent(c)])).toEqual([["Test Street", [-3, -60]]]);
  });
});

describe("plates on one post", () => {
  it("are read together: both rules govern the stretch", () => {
    const signs = [
      sign({ x: -4, y: -20, dir: "Left", type: NP, times: "MON-FRI:7am-9am", multi: 1 }),
      sign({ x: -4, y: -20, dir: "Left", type: "2P Parallel", times: "MON-FRI:9am-5pm", multi: 1 }),
      sign({ x: -4, y: -80, dir: "Right", type: NP, times: "MON-FRI:7am-9am", multi: 1 }),
      sign({ x: -4, y: -80, dir: "Right", type: "2P Parallel", times: "MON-FRI:9am-5pm", multi: 1 }),
    ];
    const { candidates } = run(signs);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.plates).toEqual(["No Parking MON-FRI:7am-9am", "2P MON-FRI:9am-5pm"]);
    expect(outBy(candidates[0]!, at("2026-09-30T20:00"))?.at).toEqual(at("2026-10-01T07:00"));
    expect(outBy(candidates[0]!, at("2026-10-01T10:00"))?.at).toEqual(at("2026-10-01T12:00"));
  });

  it("a plate with no arrow takes its post's arrow", () => {
    const signs = [
      sign({ x: -4, y: -20, dir: "Left", type: NP, times: "MON-FRI:7am-9am", multi: 1 }),
      sign({ x: -4, y: -20, dir: "Not applicable", type: "2P Parallel", times: "MON-FRI:9am-5pm", multi: 1 }),
      sign({ x: -4, y: -80, dir: "Right", type: NP, times: "MON-FRI:7am-9am", multi: 1 }),
      sign({ x: -4, y: -80, dir: "Not applicable", type: "2P Parallel", times: "MON-FRI:9am-5pm", multi: 1 }),
    ];
    const { candidates } = run(signs);
    expect(candidates.map(extent)).toEqual([[-20, -80]]);
    expect(candidates[0]!.lowConfidence).toBe(false);
    expect(candidates[0]!.plates).toHaveLength(2);
  });

  it("are found by multisignsegment when the council records them a little apart", () => {
    const signs = [
      sign({ x: -4, y: -20, dir: "Left", type: NP, times: "MON-FRI:7am-9am", multi: 1 }),
      sign({ x: -4.3, y: -21, dir: "Not applicable", type: "2P Parallel", times: "MON-FRI:9am-5pm", multi: 1 }),
      sign({ x: -4, y: -80, dir: "Right", type: NP, times: "MON-FRI:7am-9am", multi: 1 }),
      sign({ x: -4.2, y: -81, dir: "Not applicable", type: "2P Parallel", times: "MON-FRI:9am-5pm", multi: 1 }),
    ];
    const { candidates, report } = run(signs);
    expect(report.unarrowed).toBe(0);
    expect(candidates[0]!.plates).toHaveLength(2);
    expect(candidates.every((c) => !c.lowConfidence)).toBe(true);
  });
});

describe("overlaps", () => {
  it("split the kerb where rules change, and the most restrictive rule applies where they overlap", () => {
    const signs = [...westPair(-20, -100, "2P Parallel", "DAILY:7am-6pm"), ...westPair(-50, -80, NP, "DAILY:7am-9am")];
    const { candidates } = run(signs);
    expect(candidates.map(extent)).toEqual([[-20, -50], [-50, -80], [-80, -100]]);
    const middle = candidates[1]!;
    expect(middle.plates).toEqual(["2P DAILY:7am-6pm", "No Parking DAILY:7am-9am"]);
    expect(outBy(middle, at("2026-09-30T06:00"))).toEqual({ at: at("2026-09-30T07:00"), why: "No Parking DAILY:7am-9am" });
    expect(outBy(candidates[0]!, at("2026-09-30T06:00"))?.why).toBe("2P from 7am");
  });
});

describe("plate reading", () => {
  const rulesOf = (type: string, times: string | null, desc: string | null = null) => {
    const signs = [
      sign({ x: -4, y: -20, dir: "Left", type, times, desc }),
      sign({ x: -4, y: -80, dir: "Right", type, times, desc }),
    ];
    return build({ signs, ways: testStreet, screen: false }).candidates[0]?.rules;
  };

  it("reads time limits", () => {
    expect(rulesOf("1/4P Parallel", "MON-SAT:7:00AM-7:00PM")).toMatchObject([{ kind: "limit", limitHours: 0.25, days: [1, 2, 3, 4, 5, 6], start: 7, end: 19 }]);
    expect(rulesOf("1(1/2)P Parallel", "MON-FRI:9 AM-5 PM")).toMatchObject([{ limitHours: 1.5, start: 9, end: 17 }]);
    expect(rulesOf("P 10 Minute Parallel", "MON-FRI:8am-4pm")).toMatchObject([{ limitHours: 10 / 60 }]);
    expect(rulesOf("4P Angle", null)).toMatchObject([{ kind: "limit", limitHours: 4, days: [1, 2, 3, 4, 5, 6, 7], start: 0, end: 24 }]);
  });

  it("counts zones, clearways and accessible bays as no parking", () => {
    expect(rulesOf("Loading Zone", "MON-FRI:7am-6pm")).toMatchObject([{ kind: "no", start: 7, end: 18 }]);
    expect(rulesOf("Bus Zone", null)).toMatchObject([{ kind: "no", start: 0, end: 24 }]);
    expect(rulesOf("Clearway C", "MON-FRI:4-6:30pm")).toMatchObject([{ kind: "no", start: 16, end: 18.5 }]);
    expect(rulesOf("No Stopping Authorised Vehicle Excepted", null)).toMatchObject([{ kind: "no", start: 0, end: 24 }]);
    expect(rulesOf("Accessible Parking", "MON-FRI:9am-5pm")).toMatchObject([{ kind: "no", start: 0, end: 24, days: [1, 2, 3, 4, 5, 6, 7] }]);
  });

  it("ignores RESIDENT PERMITS EXCEPTED", () => {
    expect(rulesOf("2P Parallel", "MON-FRI:7am-6pm", "RESIDENT PERMITS EXCEPTED")).toMatchObject([{ kind: "limit", limitHours: 2 }]);
  });

  it("gives unlimited parking plates no rules", () => {
    expect(rulesOf("P Angle (No Limit)", null)).toEqual([]);
  });

  it("reads SCHOOLDAYS as Mon–Fri", () => {
    expect(rulesOf("No Stopping Specified Times", "SCHOOL DAYS:2:30 PM-3:30 PM")).toMatchObject([{ days: [1, 2, 3, 4, 5], start: 14.5, end: 15.5 }]);
  });

  it("reads two clauses, with an empty leading day taking the next clause's days", () => {
    expect(rulesOf(NP, ":7am-9am ,SCHOOLDAYS:2pm-4pm")).toMatchObject([
      { days: [1, 2, 3, 4, 5], start: 7, end: 9 },
      { days: [1, 2, 3, 4, 5], start: 14, end: 16 },
    ]);
    expect(rulesOf(NP, "null:7 AM-9 AM ,MON-FRI:2-5 PM")).toMatchObject([{ start: 7, end: 9 }, { start: 14, end: 17 }]);
  });

  it("reads a lone empty day as every day", () => {
    expect(rulesOf(NP, ":7am-6pm")).toMatchObject([{ days: [1, 2, 3, 4, 5, 6, 7], start: 7, end: 18 }]);
  });

  it("borrows a missing am/pm from the end time unless that puts the start after the end", () => {
    expect(rulesOf(NP, "MON-FRI:4-6:30pm")).toMatchObject([{ start: 16, end: 18.5 }]);
    expect(rulesOf(NP, "MON-FRI:7-6 PM")).toMatchObject([{ start: 7, end: 18 }]);
  });

  it("reads noon and midnight", () => {
    expect(rulesOf(NP, "MON-FRI:8am-5:30pm ,SAT:8am-12noon")).toMatchObject([{ start: 8, end: 17.5 }, { days: [6], start: 8, end: 12 }]);
    expect(rulesOf(NP, "TUESDAY:7 PM-MIDNIGHT")).toMatchObject([{ days: [2], start: 19, end: 24 }]);
    expect(rulesOf(NP, "MON-FRI:4:00PM-9:00PM ,SAT:8:00PM-12:00AM")).toMatchObject([{ start: 16, end: 21 }, { days: [6], start: 20, end: 24 }]);
  });

  it("splits a rule that runs past midnight", () => {
    expect(rulesOf(NP, "DAILY:10pm-6am")).toMatchObject([
      { days: [1, 2, 3, 4, 5, 6, 7], start: 22, end: 24 },
      { days: [1, 2, 3, 4, 5, 6, 7], start: 0, end: 6 },
    ]);
    expect(rulesOf(NP, "MON-FRI:10pm-6am")).toMatchObject([{ days: [1, 2, 3, 4, 5], start: 22, end: 24 }, { days: [2, 3, 4, 5, 6], start: 0, end: 6 }]);
  });

  it("reads St Lucia's FEB-NOV from the description as months", () => {
    expect(rulesOf("2P Parallel", "MON-FRI:7am-6pm", "ST LUCIA TRAFFIC AREA,FEB-NOV,EXCEPT AS SIGNED")).toMatchObject([{ months: [2, 11] }]);
  });

  it("reports strings it can't read, and reads those plates strictly (the rule always applies)", () => {
    const signs = [
      ...westPair(-20, -80, "2P Parallel", "MON-FRI:7am-6pm"),
      ...westPair(-100, -150, NP, "ALL OTHER TIMES:-"),
      ...westPair(-160, -190, NP, null),
    ];
    const { candidates, report } = build({ signs, ways: testStreet, screen: false });
    expect(report.unparsed).toEqual([
      { text: "No Parking Specified Times: (no times)", count: 2 },
      { text: "No Parking Specified Times: ALL OTHER TIMES:-", count: 2 },
    ]);
    expect(candidates[1]!.rules).toMatchObject([{ kind: "no", days: [1, 2, 3, 4, 5, 6, 7], start: 0, end: 24 }]);
  });
});

describe("orientation check", () => {
  it("reports each reading's clean-pairing share and uses the carriageway reading when it wins", () => {
    const { report } = run([...westPair(-20, -80, NP, "MON-FRI:7am-6pm"), ...eastPair(-100, -150, NP, "MON-FRI:7am-6pm")]);
    expect(report.orientation).toMatchObject({ carriageway: 1, footpath: 0, chosen: "carriageway" });
  });

  it("uses the footpath reading when the plates only pair that way", () => {
    // Arrows flipped: on the west kerb, Right then Left.
    const signs = [
      sign({ x: -4, y: -20, dir: "Right", type: NP, times: "MON-FRI:7am-6pm" }),
      sign({ x: -4, y: -80, dir: "Left", type: NP, times: "MON-FRI:7am-6pm" }),
    ];
    const { report, candidates } = run(signs);
    expect(report.orientation.chosen).toBe("footpath");
    expect(candidates.map(extent)).toEqual([[-20, -80]]);
  });

  it("fails the build when neither reading clearly wins", () => {
    const signs = [
      ...westPair(-20, -80, NP, "MON-FRI:7am-6pm"),
      sign({ x: 4, y: -20, dir: "Left", type: NP, times: "MON-FRI:7am-6pm" }),
      sign({ x: 4, y: -80, dir: "Right", type: NP, times: "MON-FRI:7am-6pm" }),
    ];
    expect(() => run(signs)).toThrow(/orientation/i);
  });
});

describe("screen", () => {
  const one = (type: string, times: string | null = null) => run(westPair(-20, -80, type, times)).candidates;

  it("drops kerbs that fail both the overnight and the daytime test", () => {
    expect(one("No Stopping Any Time")).toEqual([]);
    expect(one("1/4P Parallel")).toEqual([]);
    expect(one("P 10 Minute Parallel", "DAILY:7am-6pm")).toHaveLength(1); // free from 6pm
    expect(one("P 10 Minute Parallel")).toEqual([]);
  });

  it("keeps a kerb you can stay on overnight", () => {
    const [c] = one("2P Parallel", "MON-FRI:7am-6pm");
    expect(c).toMatchObject({ overnight: true, dayOnly: false, maxStayHours: 2 });
  });

  it("keeps a kerb with 4 h between 7am and 7pm, flagged day only when no night passes", () => {
    const [c] = one(NP, "DAILY:10pm-6am");
    expect(c).toMatchObject({ overnight: false, daytime: true, dayOnly: true, maxStayHours: null });
  });

  it("fails the daytime test on 2P all day but passes overnight with no limit at night", () => {
    expect(one("2P Parallel", "DAILY:7am-7pm")[0]).toMatchObject({ overnight: true, daytime: false });
    expect(one("4P Parallel", "DAILY:7am-7pm")[0]).toMatchObject({ overnight: true, daytime: true });
  });

  it("drops stretches shorter than 8 m", () => {
    expect(run(westPair(-20, -26, NP, "MON-FRI:7am-6pm")).candidates).toEqual([]);
  });
});

describe("Adsett St in the real snapshot", () => {
  // Plates and centrelines for Adsett St, cut from the snapshot. The council data research measured
  // the stretches as W ~47 m no parking, ~14 m angle, ~49 m no parking, ~45 m no stopping; E ~53 m and ~69 m.
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/adsett.json", import.meta.url), "utf8"));
  const { candidates, report } = build(fixture);

  it("reads the arrows from the carriageway", () => {
    expect(report.orientation.chosen).toBe("carriageway");
  });

  it("pairs the plates into the measured stretches", () => {
    const adsett = candidates.filter((c) => c.street === "Adsett Street");
    const lengths = (side: string) => adsett.filter((c) => c.side === side).map((c) => c.lengthM).sort((a, b) => a - b);
    // The no-stopping stretch at the Moggill Rd end fails the screen.
    expect(lengths("west")).toEqual([expect.closeTo(14, -1), expect.closeTo(47, -1), expect.closeTo(49, -1)]);
    expect(lengths("east")).toEqual([expect.closeTo(53, -1), expect.closeTo(69, -1)]);
    expect(adsett.every((c) => !c.lowConfidence)).toBe(true);
  });
});
