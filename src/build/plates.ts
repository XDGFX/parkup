// Reads a BCC sign plate (restriction type, days and times, description) into timetable rules.
// The rules for reading plates are in the spec's Kerb-stretch model; the formats are in the council data research.
import type { Rule } from "../timetable/timetable.ts";
import type { SignRecord } from "./inputs.ts";

export type Plate = {
  /** Short plate text for the card, e.g. "2P MON-FRI:7am-6pm". */
  label: string;
  rules: Rule[];
  /** The text that couldn't be read, when the rules are the strict fallback (the rule always applies). */
  unparsed?: string;
};

const ALL = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAYS = [1, 2, 3, 4, 5];

/** "ST LUCIA" as "St Lucia": council records are upper case. */
export const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Plates that mark an area or the end of one, rather than governing a length of kerb. */
export const isAreaPlate = (type: string) => /TRAFFIC AREA|Control Area|^End C$/i.test(type);

type Effect = { kind: "no" } | { kind: "limit"; hours: number } | { kind: "free" };

function effectOf(type: string, desc: string): Effect | null {
  // Paid parking counts as no parking; accessible bays are handled by the caller.
  if (/METER|TICKET|PAID/i.test(desc)) return { kind: "no" };
  if (/^(No Stopping|No Parking)|Zone|Clearway/i.test(type)) return { kind: "no" };
  if (/No Limit/i.test(type)) return { kind: "free" };
  const minutes = type.match(/^P\s*(\d+)\s*Minute/i);
  if (minutes) return { kind: "limit", hours: Number(minutes[1]) / 60 };
  const hours = type.match(/^(\d+)?(?:\((\d+)\/(\d+)\)|\/(\d+))?P\b/);
  if (hours && (hours[1] || hours[4])) {
    const whole = hours[2] ? Number(hours[1]) : 0;
    const frac = hours[2] ? Number(hours[2]) / Number(hours[3]) : hours[4] ? Number(hours[1]) / Number(hours[4]) : Number(hours[1]);
    return { kind: "limit", hours: whole + frac };
  }
  return null;
}

const DAYS: [RegExp, number[]][] = [
  [/^(MON-FRI|SCHOOL ?DAYS)$/, WEEKDAYS],
  [/^MON-SAT$/, [1, 2, 3, 4, 5, 6]],
  [/^(MON-SUN|DAILY)$/, ALL],
  [/^MON(DAY)?$/, [1]], [/^TUE(SDAY)?$/, [2]], [/^WED(NESDAY)?$/, [3]], [/^THU(RSDAY)?$/, [4]],
  [/^FRI(DAY)?$/, [5]], [/^SAT(URDAY)?$/, [6]], [/^SUN(DAY)?$/, [7]],
];

type Clock = { h: number; m: number; ampm?: "AM" | "PM" | "NOON" | "MIDNIGHT" };
const CLOCK = /^(?:(\d{1,2})(?::(\d{2}))?\s*(AM|PM|NOON)?|(MIDNIGHT|NOON))$/;

function readClock(s: string): Clock | null {
  const m = s.trim().toUpperCase().match(CLOCK);
  if (!m) return null;
  if (m[4]) return { h: 12, m: 0, ampm: m[4] as Clock["ampm"] };
  return { h: Number(m[1]), m: Number(m[2] ?? 0), ampm: m[3] as Clock["ampm"] };
}

function hours(c: Clock, ampm: Clock["ampm"], isEnd: boolean): number {
  const h = c.h % 12 + c.m / 60;
  if (ampm === "MIDNIGHT") return isEnd ? 24 : 0;
  if (ampm === "NOON") return 12;
  if (ampm === "PM") return h + 12;
  // 12:00AM at the end of a range is midnight.
  return isEnd && h === 0 ? 24 : h;
}

/** "7am-6pm" → [7, 18]. A missing am/pm on the start is taken from the end unless that puts the start after it. */
function readRange(s: string): [number, number] | null {
  const [a, b, ...rest] = s.split("-");
  if (a === undefined || b === undefined || rest.length) return null;
  const from = readClock(a), to = readClock(b);
  if (!from || !to || !to.ampm) return null;
  const end = hours(to, to.ampm, true);
  let start: number;
  if (from.ampm) start = hours(from, from.ampm, false);
  else {
    start = hours(from, to.ampm === "PM" ? "PM" : "AM", false);
    if (start > end) start = hours(from, "AM", false);
  }
  return start === end ? null : [start, end];
}

const nextDays = (days: number[]) => days.map((d) => (d % 7) + 1).sort((a, b) => a - b);

/** "MON-FRI:7am-6pm ,SAT:8am-12noon" → day and hour spans, or null if any part can't be read. */
function readTimes(text: string): { days: number[]; start: number; end: number }[] | null {
  const clauses = text.split(",").map((c) => {
    const i = c.indexOf(":");
    return { day: c.slice(0, i).trim().toUpperCase(), time: i < 0 ? "" : c.slice(i + 1).trim() };
  });
  const spans: { days: number[]; start: number; end: number }[] = [];
  for (let i = 0; i < clauses.length; i++) {
    let { day } = clauses[i]!;
    // An empty leading day takes the day of the following clause; a lone empty day is every day.
    for (let j = i + 1; (day === "" || day === "NULL") && j < clauses.length; j++) day = clauses[j]!.day;
    const days = day === "" || day === "NULL" ? ALL : DAYS.find(([re]) => re.test(day))?.[1];
    const range = readRange(clauses[i]!.time);
    if (!days || !range) return null;
    const [start, end] = range;
    if (end > start) spans.push({ days, start, end });
    else spans.push({ days, start, end: 24 }, { days: nextDays(days), start: 0, end });
  }
  return spans;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function readMonths(desc: string): [number, number] | undefined {
  const m = desc.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/);
  return m ? [MONTHS.indexOf(m[1]!) + 1, MONTHS.indexOf(m[2]!) + 1] : undefined;
}

/** "No Parking Specified Times" → "No Parking", "2P Parallel" → "2P". */
const shortType = (type: string) => type.replace(/\s+(Specified Times|Parallel|Angle)$/i, "").replace(/\s+Linear Repeater-Specified Times$/i, "");

export function readPlate(r: SignRecord): Plate {
  const type = (r.parkingrestrictiontype ?? "").trim();
  const times = r.parkingrestrictiondaysandtimes?.trim() || null;
  const desc = (r.parkingrestrictiondescription ?? "").toUpperCase();
  const label = times ? `${shortType(type)} ${times}` : shortType(type);
  const months = readMonths(desc);
  const effect = effectOf(type, desc);
  const accessible = /Accessible|Disabled/i.test(type);
  const make = (spans: { days: number[]; start: number; end: number }[]): Rule[] => {
    if (accessible) return [{ kind: "no", days: ALL, start: 0, end: 24, label }];
    if (!effect || effect.kind === "free") return [];
    return spans.map((s) => ({
      kind: effect.kind, ...s, ...(months && { months }),
      ...(effect.kind === "limit" && { limitHours: effect.hours }), label,
    }));
  };
  const always = [{ days: ALL, start: 0, end: 24 }];
  // Strict fallback: a plate we can't read is taken to apply at all times.
  const strict = (why: string): Plate => ({ label, rules: make(always), unparsed: why });

  if (!effect && !accessible) return { label, rules: [{ kind: "no", days: ALL, start: 0, end: 24, label }], unparsed: `${type}: unknown type` };
  if (accessible || effect?.kind === "free") return { label, rules: make(always) };
  if (!times) {
    // "Specified Times" with no times, or days with no times, can't be read; otherwise the plate applies at all times.
    if (/Specified Times/i.test(type) || /SCHOOL DAYS|ALL OTHER TIMES/.test(desc)) return strict(`${type}: (no times)`);
    return { label, rules: make(always) };
  }
  if (/^AT ALL TIMES:-?$/i.test(times)) return { label, rules: make(always) };
  const spans = readTimes(times);
  return spans ? { label, rules: make(spans) } : strict(`${type}: ${times}`);
}
