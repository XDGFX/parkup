// The weekly timetable: when a candidate can be parked on, shared by the build screen and the app.
// Every time is read in Australia/Brisbane time, whatever the device's time zone.

export type Rule = {
  kind: "no" | "limit";
  /** ISO weekdays, 1 = Mon … 7 = Sun. */
  days: number[];
  /** Hours, local Brisbane time. A rule that runs past midnight is split into two rules. */
  start: number;
  end: number;
  /** Months the rule applies in, inclusive, e.g. [2, 11] for Feb–Nov. All year when absent. */
  months?: [from: number, to: number];
  /** For kind "limit": hours you may stay, e.g. 2 for 2P or 0.25 for ¼P. */
  limitHours?: number;
  /** Raw plate text, for the card. */
  label: string;
};

export type Timetabled = { rules: Rule[] };
export type Window = { from: Date; to: Date };
export type Status = "ok" | "limited" | "no";
export type PresetKey = "tonight" | "weekend" | "now";
export type Preset = Window & { key: PresetKey; title: string; sub: string };

const HOUR = 3600e3;
// Brisbane has had no daylight saving since 1992, so its offset is fixed. A fixed offset is also much
// cheaper than Intl in outBy's scan, which runs once per candidate per window.
const BRISBANE_OFFSET = 10 * HOUR;
const STEP = 15 * 60e3;
const SCAN = 7 * 24 * HOUR;
/** An overnight stay needs this long from the window start; shorter windows need their whole length. */
export const MIN_STAY_HOURS = 8;

/** Wall-clock parts of an instant in Brisbane. */
export function brisbane(d: Date | number) {
  const w = new Date(+d + BRISBANE_OFFSET);
  return {
    year: w.getUTCFullYear(),
    month: w.getUTCMonth() + 1,
    date: w.getUTCDate(),
    dow: ((w.getUTCDay() + 6) % 7) + 1,
    hour: w.getUTCHours() + w.getUTCMinutes() / 60 + w.getUTCSeconds() / 3600,
  };
}

/** The instant at `hour` o'clock Brisbane time, `days` days after the Brisbane date of `base`. */
export function brisbaneAt(base: Date | number, days: number, hour: number): Date {
  const b = brisbane(base);
  return new Date(Date.UTC(b.year, b.month - 1, b.date + days) + hour * HOUR - BRISBANE_OFFSET);
}

function applies(r: Rule, t: ReturnType<typeof brisbane>): boolean {
  if (!r.days.includes(t.dow) || t.hour < r.start || t.hour >= r.end) return false;
  if (!r.months) return true;
  const [from, to] = r.months;
  return from <= to ? t.month >= from && t.month <= to : t.month >= from || t.month <= to;
}

/** The rules in force at `d`, resolved to the most restrictive: any "no", else the shortest limit. */
function inForce(c: Timetabled, d: Date | number): { status: Status; rule?: Rule } {
  const t = brisbane(d);
  let shortest: Rule | undefined;
  for (const r of c.rules) {
    if (!applies(r, t)) continue;
    if (r.kind === "no") return { status: "no", rule: r };
    if (!shortest || (r.limitHours ?? 0) < (shortest.limitHours ?? 0)) shortest = r;
  }
  return shortest ? { status: "limited", rule: shortest } : { status: "ok" };
}

export const statusAt = (c: Timetabled, d: Date): Status => inForce(c, d).status;

/** "2P", "¼P", "P10min": how a limit reads on a plate. */
export function limitName(hours: number): string {
  if (hours < 0.25) return `P${Math.round(hours * 60)}min`;
  const named: Record<number, string> = { 0.25: "¼P", 0.5: "½P", 1.5: "1½P" };
  return named[hours] ?? `${hours}P`;
}

/** "8am", "5:30pm" in Brisbane time. */
export function fmtTime(d: Date | number): string {
  const h = brisbane(d).hour, hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  const h12 = hh % 12 || 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${hh < 12 ? "am" : "pm"}`;
}

/**
 * When you'd have to move if you parked at `arrival`: the first no-parking time, or the end of a time limit.
 * A limit counts from when it starts applying, so 2P from 6am means out by 8am if you parked overnight.
 * Null when nothing forces a move within a week.
 */
export function outBy(c: Timetabled, arrival: Date): { at: Date; why: string } | null {
  if (!c.rules.length) return null;
  const from = +arrival;
  let limitedSince: number | null = null;
  // Check the arrival, then every quarter hour on the clock, which is where plate times fall.
  for (let t = from; t < from + SCAN; t = (Math.floor(t / STEP) + 1) * STEP) {
    const { status, rule } = inForce(c, t);
    if (status === "no") return { at: new Date(t), why: rule!.label || "No parking" };
    if (status !== "limited") { limitedSince = null; continue; }
    limitedSince ??= t;
    const end = limitedSince + rule!.limitHours! * HOUR;
    const next = (Math.floor(t / STEP) + 1) * STEP;
    if (end <= next) {
      const name = limitName(rule!.limitHours!);
      return { at: new Date(end), why: limitedSince === from ? `${name} limit` : `${name} from ${fmtTime(limitedSince)}` };
    }
  }
  return null;
}

const minStay = (w: Window) => Math.min(MIN_STAY_HOURS * HOUR, +w.to - +w.from);

/** True when you can stay long enough after parking at the window start: 8 h, or the whole window if shorter. */
export function canStay(c: Timetabled, w: Window): boolean {
  const o = outBy(c, w.from);
  return !o || +o.at - +w.from >= minStay(w);
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const fmtDay = (d: Date | number) => DAY_NAMES[brisbane(d).dow - 1]!;

/** The Tonight, Weekend and Now presets as of `now`. */
export function windows(now = new Date()): Preset[] {
  const { hour, dow } = brisbane(now);
  const tonight: Window = hour < 7
    ? { from: now, to: brisbaneAt(now, 0, 7) }
    : { from: hour >= 18 ? now : brisbaneAt(now, 0, 18), to: brisbaneAt(now, 1, 7) };
  const fri = brisbaneAt(now, dow === 7 ? -2 : dow === 6 ? -1 : 5 - dow, 18);
  const weekend: Window = { from: now > fri ? now : fri, to: brisbaneAt(fri, 3, 7) };
  const day: Window = { from: now, to: new Date(+now + 3 * HOUR) };
  return [
    { key: "tonight", title: "Tonight", sub: `${fmtTime(tonight.from)}–${fmtTime(tonight.to)}`, ...tonight },
    { key: "weekend", title: "Weekend", sub: `${fmtDay(weekend.from)}–Mon ${fmtTime(weekend.to)}`, ...weekend },
    { key: "now", title: "Now", sub: `til ${fmtTime(day.to)}`, ...day },
  ];
}
