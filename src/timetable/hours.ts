// Toilet opening hours: the free-text `openinghours` from the National Public Toilet Map, read into weekly
// spans and checked against a time window with the same Brisbane-time logic as parking rules.
import { applies, brisbane, type Span, type Window } from "./timetable.ts";

/** The hours as written, and the weekly spans they're open, or null when the text can't be read. */
export type Hours = { text: string; open: Span[] | null };

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
/**
 * "Daylight hours", taken as 6am–6pm. Brisbane's sunrise runs 4:50–6:40am and sunset 5–6:45pm over the year, and
 * park blocks are locked around dusk, so this errs towards closed at night, which is when it matters.
 */
const DAYLIGHT = { start: 6, end: 18 };
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Mon-Wed,Fri" → [1, 2, 3, 5]; "Sep-Mar" → [9, 3] for months. Null if any name isn't recognised. */
function names(list: string, of: string[]): number[] | null {
  const out: number[] = [];
  for (const part of list.toLowerCase().split(",")) {
    const [a, b] = part.split("-").map((n) => of.indexOf(n) + 1);
    if (!a || (b !== undefined && !b)) return null;
    for (let i = a; ; i = (i % of.length) + 1) { out.push(i); if (i === (b ?? a)) break; }
  }
  return out;
}

/** "5:30am" → 5.5, "12am" → 0, "12pm" → 12. */
function hour(s: string): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/i.exec(s);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (h < 1 || h > 12 || min > 59) return null;
  return (h % 12) + (m[3]!.toLowerCase() === "pm" ? 12 : 0) + min / 60;
}

const MONTH = `(?:${MONTHS.join("|")})`;
const GROUP = new RegExp(`^(?:(${MONTH}-${MONTH}) )?(?:([A-Za-z,-]+) )?(Daylight hours|24 hours|\\S+-\\S+)$`, "i");

/** One comma-separated group, such as "Mon-Fri 6am-10pm" or "Apr-Aug 6am-10pm", as spans. */
function group(g: string): Span[] | null {
  const m = GROUP.exec(g);
  if (!m) return null;
  const [, monthText, dayText, timeText] = m;
  let months: [number, number] | undefined;
  if (monthText) {
    const [a, b] = monthText.toLowerCase().split("-").map((n) => MONTHS.indexOf(n) + 1);
    if (!a || !b) return null;
    months = [a, b];
  }
  const days = dayText ? names(dayText, DAYS) : ALL_DAYS;
  if (!days) return null;
  let start: number, end: number;
  if (/^24 hours$/i.test(timeText!)) [start, end] = [0, 24];
  else if (/^Daylight hours$/i.test(timeText!)) [start, end] = [DAYLIGHT.start, DAYLIGHT.end];
  else {
    const [a, b] = timeText!.split("-").map(hour);
    if (a == null || b == null) return null;
    [start, end] = [a, b || 24];
  }
  const span = (d: number[], s: number, e: number): Span => ({ days: d, start: s, end: e, ...(months && { months }) });
  if (end > start) return [span(days, start, end)];
  // Past midnight: the rest of the day, then the small hours of the next.
  return [span(days, start, 24), span(days.map((d) => (d % 7) + 1), 0, end)];
}

/** Reads the common forms: "Daylight hours", "24 hours", and times with optional days and months. */
export function parseHours(text: string): Hours {
  const body = text.trim();
  if (/^currently closed$/i.test(body)) return { text, open: [] };
  const m = /^OPEN:\s*(.+)$/i.exec(body);
  if (!m) return { text, open: null };
  const spans: Span[] = [];
  for (const g of m[1]!.split(/,\s+/)) {
    const s = group(g);
    if (!s) return { text, open: null };
    spans.push(...s);
  }
  return { text, open: spans };
}

const openAt = (open: Span[], d: Date | number) => { const t = brisbane(d); return open.some((s) => applies(s, t)); };

/**
 * True when the parsed hours say the toilet is shut for the window: closed when you arrive, or closed in the last
 * minutes before you leave. That covers the evening and the morning of an overnight stay.
 * Hours that couldn't be read are never closed.
 */
export function closedFor(h: Hours, w: Window): boolean {
  if (!h.open) return false;
  return !openAt(h.open, w.from) || !openAt(h.open, +w.to - 60e3);
}
