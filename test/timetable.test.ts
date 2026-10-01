import { describe, expect, it } from "vitest";
import { canStay, outBy, statusAt, windows, type Rule, type Window } from "../src/timetable/timetable.ts";

const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL = [1, 2, 3, 4, 5, 6, 7];
// Every time in these tests is Brisbane time (UTC+10, no daylight saving).
const at = (s: string) => new Date(`${s}+10:00`);
const kerb = (rules: Rule[]) => ({ rules });
const win = (from: string, hours: number): Window => ({ from: at(from), to: new Date(+at(from) + hours * 3600e3) });
const limit = (days: number[], start: number, end: number, limitHours: number, label: string, months?: [number, number]): Rule =>
  ({ kind: "limit", days, start, end, limitHours, label, ...(months && { months }) });
const no = (days: number[], start: number, end: number, label: string): Rule => ({ kind: "no", days, start, end, label });

// 2026-09-30 is a Wednesday; 2026-10-02 a Friday.
const twoP = kerb([limit(ALL, 6, 18, 2, "2P 6am–6pm")]);
const wk = kerb([limit(WEEKDAYS, 7, 18, 2, "2P 7am–6pm Mon–Fri")]);
const ban = kerb([no(ALL, 5, 7, "No parking 5–7am")]);

describe("outBy (cases from the prototype's outby.check.mjs)", () => {
  it("2P from 6am, parked the evening before → out by 8am", () => {
    const r = outBy(twoP, at("2026-09-30T21:00"));
    expect(r?.at).toEqual(at("2026-10-01T08:00"));
    expect(r?.why).toMatch(/2P/);
  });

  it("arriving mid-limit gives 2 hours from arrival", () => {
    expect(outBy(twoP, at("2026-10-01T10:30"))?.at).toEqual(at("2026-10-01T12:30"));
  });

  it("a limit that ends before its hours are up lets you stay overnight", () => {
    expect(outBy(twoP, at("2026-10-01T17:00"))?.at).toEqual(at("2026-10-02T08:00"));
  });

  it("weekday-only limit parked on Friday night → out by Monday 9am", () => {
    expect(outBy(wk, at("2026-10-02T21:00"))?.at).toEqual(at("2026-10-05T09:00"));
  });

  it("no parking 5–7am → out by 5am, with the plate as the reason", () => {
    const r = outBy(ban, at("2026-09-30T18:00"));
    expect(r?.at).toEqual(at("2026-10-01T05:00"));
    expect(r?.why).toBe("No parking 5–7am");
  });

  it("an unsigned kerb has no time to leave by", () => {
    expect(outBy(kerb([]), at("2026-09-30T18:00"))).toBeNull();
  });

  it("arriving off the quarter hour still catches a ban at its start", () => {
    expect(outBy(ban, at("2026-09-30T21:07"))?.at).toEqual(at("2026-10-01T05:00"));
  });
});

describe("canStay (cases from the prototype's outby.check.mjs)", () => {
  it("Keith St: out by 5am is 11 h, enough for overnight", () => {
    expect(canStay(ban, win("2026-09-30T18:00", 13))).toBe(true);
  });
  it("Harts Rd: out by 10pm is only 4 h", () => {
    const harts = kerb([no(ALL, 22, 24, "No parking 10pm–6am"), no(ALL, 0, 6, "")]);
    expect(canStay(harts, win("2026-09-30T18:00", 13))).toBe(false);
  });
  it("arriving at 10pm, out by 5am is 7 h", () => {
    expect(canStay(ban, win("2026-09-30T22:00", 9))).toBe(false);
  });
  it("Now at 3pm on a weekday 2P: out by 5pm, short of 3 h", () => {
    expect(canStay(wk, win("2026-09-30T15:00", 3))).toBe(false);
  });
  it("Now at 7pm: no limit until tomorrow", () => {
    expect(canStay(wk, win("2026-09-30T19:00", 3))).toBe(true);
  });
  it("unsigned kerb", () => {
    expect(canStay(kerb([]), win("2026-09-30T18:00", 13))).toBe(true);
  });
});

describe("months (St Lucia Traffic Area: 2P, 7am–6pm Mon–Fri, Feb–Nov)", () => {
  const stLucia = kerb([limit(WEEKDAYS, 7, 18, 2, "St Lucia Traffic Area", [2, 11])]);
  it("applies inside Feb–Nov", () => {
    expect(statusAt(stLucia, at("2026-03-04T10:00"))).toBe("limited");
    expect(outBy(stLucia, at("2026-03-04T10:00"))?.at).toEqual(at("2026-03-04T12:00"));
  });
  it("doesn't apply in December or January", () => {
    expect(statusAt(stLucia, at("2026-12-02T10:00"))).toBe("ok");
    expect(statusAt(stLucia, at("2027-01-06T10:00"))).toBe("ok");
  });
  it("a stay that runs from November into December is only limited in November", () => {
    // Monday 30 Nov 2026, 5pm: 2P runs to 6pm, then nothing applies from 1 Dec.
    expect(outBy(stLucia, at("2026-11-30T17:00"))).toBeNull();
  });
});

describe("short limits", () => {
  it("P10min fails a Now window", () => {
    const p10 = kerb([limit(ALL, 0, 24, 10 / 60, "P 10 Minute")]);
    expect(outBy(p10, at("2026-09-30T15:00"))?.at).toEqual(at("2026-09-30T15:10"));
    expect(canStay(p10, win("2026-09-30T15:00", 3))).toBe(false);
  });
  it("¼P fails overnight", () => {
    expect(canStay(kerb([limit(ALL, 0, 24, 0.25, "1/4P")]), win("2026-09-30T18:00", 13))).toBe(false);
  });
});

describe("overlapping rules resolve to the most restrictive", () => {
  it("no parking beats a limit", () => {
    const c = kerb([limit(ALL, 7, 18, 2, "2P 7am–6pm"), no(ALL, 7, 9, "No parking 7–9am")]);
    expect(statusAt(c, at("2026-09-30T08:00"))).toBe("no");
    expect(outBy(c, at("2026-09-29T20:00"))).toEqual({ at: at("2026-09-30T07:00"), why: "No parking 7–9am" });
  });
  it("the shortest limit applies", () => {
    const c = kerb([limit(ALL, 7, 18, 2, "2P 7am–6pm"), limit(ALL, 9, 17, 1, "1P 9am–5pm")]);
    expect(outBy(c, at("2026-09-30T09:00"))?.at).toEqual(at("2026-09-30T10:00"));
  });
});

describe("windows", () => {
  const byKey = (now: string) => Object.fromEntries(windows(at(now)).map((w) => [w.key, w]));

  it("Tonight before 6pm runs 6pm to 7am", () => {
    const { tonight } = byKey("2026-09-30T17:00");
    expect(tonight!.from).toEqual(at("2026-09-30T18:00"));
    expect(tonight!.to).toEqual(at("2026-10-01T07:00"));
  });
  it("Tonight after 6pm starts now", () => {
    expect(byKey("2026-09-30T20:30").tonight!.from).toEqual(at("2026-09-30T20:30"));
  });
  it("Tonight before 7am runs from now to 7am", () => {
    const { tonight } = byKey("2026-10-01T03:00");
    expect(tonight!.from).toEqual(at("2026-10-01T03:00"));
    expect(tonight!.to).toEqual(at("2026-10-01T07:00"));
  });
  it("Tonight just after 7am is this evening", () => {
    expect(byKey("2026-10-01T07:15").tonight!.from).toEqual(at("2026-10-01T18:00"));
  });
  it("Weekend on a Wednesday runs Friday 6pm to Monday 7am", () => {
    const { weekend } = byKey("2026-09-30T12:00");
    expect(weekend!.from).toEqual(at("2026-10-02T18:00"));
    expect(weekend!.to).toEqual(at("2026-10-05T07:00"));
  });
  it("Weekend on Friday evening starts now", () => {
    expect(byKey("2026-10-02T19:00").weekend!.from).toEqual(at("2026-10-02T19:00"));
  });
  it("Weekend on Sunday starts now and ends Monday 7am", () => {
    const { weekend } = byKey("2026-10-04T10:00");
    expect(weekend!.from).toEqual(at("2026-10-04T10:00"));
    expect(weekend!.to).toEqual(at("2026-10-05T07:00"));
  });
  it("Now is the next 3 hours", () => {
    const { now } = byKey("2026-09-30T15:00");
    expect(now!.to).toEqual(at("2026-09-30T18:00"));
  });
  it("Brisbane time is used whatever the device's time zone", () => {
    // 10pm UTC on Wednesday is 8am Thursday in Brisbane.
    const { tonight } = Object.fromEntries(windows(new Date("2026-09-30T22:00Z")).map((w) => [w.key, w]));
    expect(tonight!.from).toEqual(at("2026-10-01T18:00"));
  });
});

describe("the 8 h minimum against a shorter window", () => {
  const sixAm = kerb([no(ALL, 6, 9, "No parking 6–9am")]);
  it("a 4 h window (3am to 7am) needs the whole 4 h", () => {
    expect(canStay(sixAm, win("2026-10-01T03:00", 4))).toBe(false);
    expect(canStay(kerb([no(ALL, 7, 9, "No parking 7–9am")]), win("2026-10-01T03:00", 4))).toBe(true);
  });
  it("a 13 h overnight window needs only 8 h", () => {
    expect(canStay(sixAm, win("2026-09-30T18:00", 13))).toBe(true);
    expect(canStay(kerb([no(ALL, 1, 9, "No parking 1–9am")]), win("2026-09-30T18:00", 13))).toBe(false);
  });
});
