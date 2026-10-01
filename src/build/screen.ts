// The legal screen, through the same canStay the app uses.
import { brisbaneAt, canStay, type Timetabled } from "../timetable/timetable.ts";
import { SCREEN } from "./config.ts";

const HOUR = 3600e3, QUARTER = 0.25;
const monday = new Date(`${SCREEN.REFERENCE_MONDAY}T12:00:00+10:00`);
const week = [0, 1, 2, 3, 4, 5, 6];

/** Parked at 6pm, you can stay 8 h, on at least one night of the week. */
export function passesOvernight(c: Timetabled): boolean {
  return week.some((d) => {
    const from = brisbaneAt(monday, d, SCREEN.OVERNIGHT_FROM_HOUR);
    return canStay(c, { from, to: new Date(+from + SCREEN.OVERNIGHT_HOURS * HOUR) });
  });
}

/** 4 continuous hours between 7am and 7pm, on at least one day of the week. */
export function passesDaytime(c: Timetabled): boolean {
  return week.some((d) => {
    for (let h = SCREEN.DAY_FROM_HOUR; h <= SCREEN.DAY_TO_HOUR - SCREEN.DAY_HOURS; h += QUARTER) {
      const from = brisbaneAt(monday, d, h);
      if (canStay(c, { from, to: new Date(+from + SCREEN.DAY_HOURS * HOUR) })) return true;
    }
    return false;
  });
}

/** The shortest time limit on the plates, in hours, or null when there's none. */
export function maxStayHours(c: Timetabled): number | null {
  const limits = c.rules.flatMap((r) => (r.kind === "limit" && r.limitHours ? [r.limitHours] : []));
  return limits.length ? Math.min(...limits) : null;
}
