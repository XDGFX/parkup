import { describe, expect, it } from "vitest";
import { closedFor, parseHours } from "../src/timetable/hours.ts";
import { windows, type Window } from "../src/timetable/timetable.ts";

// Every time in these tests is Brisbane time (UTC+10, no daylight saving). 2026-09-30 is a Wednesday.
const at = (s: string) => new Date(`${s}+10:00`);
const win = (from: string, to: string): Window => ({ from: at(from), to: at(to) });
const closed = (text: string, w: Window) => closedFor(parseHours(text), w);

const tonight = win("2026-09-30T18:00", "2026-10-01T07:00");
const afternoon = win("2026-09-30T14:00", "2026-09-30T17:00");

describe("toilet hours: open for the window", () => {
  it("24 hours is never closed", () => {
    expect(closed("OPEN: 24 hours", tonight)).toBe(false);
  });

  it("daylight hours are open in the afternoon but closed for tonight", () => {
    expect(closed("OPEN: Daylight hours", afternoon)).toBe(false);
    expect(closed("OPEN: Daylight hours", tonight)).toBe(true);
  });

  it("a toilet must be open at both ends of the window: when you arrive and before you leave", () => {
    // Open at 6pm but not before 7am: no good for the morning.
    expect(closed("OPEN: 9am-9pm", tonight)).toBe(true);
    expect(closed("OPEN: 5am-10pm", tonight)).toBe(false);
    expect(closed("OPEN: 5am-10pm", win("2026-09-30T18:00", "2026-09-30T21:00"))).toBe(false);
    expect(closed("OPEN: 5:30am-8pm", win("2026-09-30T20:00", "2026-09-30T23:00"))).toBe(true);
  });

  it("explicit times run past midnight into the next day", () => {
    // Friday 3:45am–2am Saturday.
    const h = "OPEN: Fri 3:45am-2am, Sat 3:35am-2am, Mon-Thu 3:45am-1am, Sun 3:30am-12:15am";
    expect(closed(h, win("2026-10-02T22:00", "2026-10-03T01:30"))).toBe(false);
    expect(closed(h, win("2026-10-02T22:00", "2026-10-03T02:30"))).toBe(true);
  });

  it("reads day lists and ranges", () => {
    const h = "OPEN: Mon-Wed,Fri 9am-5:30pm, Thu 9am-9pm, Sat 9am-5pm, Sun 10am-5pm";
    expect(closed(h, win("2026-10-01T18:00", "2026-10-01T20:00"))).toBe(false); // Thursday
    expect(closed(h, win("2026-10-02T18:00", "2026-10-02T20:00"))).toBe(true); // Friday
    expect(closed("OPEN: Mon-Fri 4:30am-9pm, Sat-Sun 5am-9pm", win("2026-10-04T08:00", "2026-10-04T10:00"))).toBe(false); // Sunday
  });

  it("reads month ranges", () => {
    const h = "OPEN: Apr-Aug 6am-10pm, Sep-Mar 4:30am-11pm";
    expect(closed(h, win("2026-09-30T22:00", "2026-09-30T22:45"))).toBe(false);
    expect(closed(h, win("2026-06-30T22:00", "2026-06-30T22:45"))).toBe(true);
  });

  it("12am as a closing time is midnight", () => {
    expect(closed("OPEN: 6am-12am", win("2026-09-30T21:00", "2026-09-30T23:59"))).toBe(false);
  });

  it("currently closed is always closed", () => {
    expect(closed("Currently closed", afternoon)).toBe(true);
  });

  it("anything else is unparseable: kept as written and never closed", () => {
    for (const text of ["OPEN: Variable hours", "OPEN: Venue hours", "Ask at the counter"]) {
      const h = parseHours(text);
      expect(h).toEqual({ text, open: null });
      expect(closedFor(h, tonight)).toBe(false);
    }
  });

  it("works for every preset window", () => {
    for (const w of windows(at("2026-09-30T12:00"))) expect(closed("OPEN: 24 hours", w)).toBe(false);
  });
});
