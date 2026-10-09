// OSM time tags on a site, read into timetable rules: `opening_hours` (closed hours are no parking), `maxstay`
// (a limit at all times) and `fee:conditional` (no parking while the fee applies). Only the common forms are read.
import { ALL_DAYS as ALL, DAYLIGHT, dailySpans, names } from "../timetable/hours.ts";
import type { Rule, Span } from "../timetable/timetable.ts";

const DAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"];
/** sunrise–sunset and dawn–dusk, taken as daylight, like the toilets' "Daylight hours". */
const SUN: Record<string, number> = { sunrise: DAYLIGHT.start, dawn: DAYLIGHT.start, sunset: DAYLIGHT.end, dusk: DAYLIGHT.end };

/** "Mo-Fr,Su" → [1, 2, 3, 4, 5, 7]. Public and school holidays (PH, SH) are left out. Null if a name isn't recognised. */
function days(list: string): number[] | null {
  const named = list.split(",").filter((p) => p !== "PH" && p !== "SH");
  return named.length ? names(named.join(","), DAYS) : [];
}

/** "06:30" → 6.5, "sunset" → 18. */
function time(s: string): number | null {
  if (s in SUN) return SUN[s]!;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m && Number(m[1]) <= 24 && Number(m[2]) < 60 ? Number(m[1]) + Number(m[2]) / 60 : null;
}

/** One rule, such as "Mo-Fr 07:00-19:00,20:00-22:00", "Sa,Su off" or "06:00-18:00", as the days it names and their open spans. */
function rule(text: string): { days: number[]; open: Span[] } | null {
  const m = /^(?:([A-Z][a-z](?:[-,][A-Z][A-Za-z])*)\s*)?(.*)$/.exec(text.trim());
  if (!m) return null;
  const d = m[1] ? days(m[1]) : ALL;
  const times = m[2]!.trim();
  if (!d) return null;
  if (/^(off|closed)$/.test(times)) return { days: d, open: [] };
  if (!times || times === "24/7") return { days: d, open: [{ days: d, start: 0, end: 24 }] };
  const open: Span[] = [];
  for (const range of times.split(",")) {
    const [a, b, extra] = range.trim().split("-").map(time);
    if (a == null || b == null || extra !== undefined) return null;
    open.push(...dailySpans(d, a, b));
  }
  return { days: d, open };
}

/** The weekly spans an `opening_hours` value is open, or null when it can't be read. Later rules override earlier ones for their days. */
export function openSpans(text: string): Span[] | null {
  if (text.trim() === "24/7") return [{ days: ALL, start: 0, end: 24 }];
  let spans: Span[] = [];
  for (const part of text.split(";").map((p) => p.trim()).filter(Boolean)) {
    const r = rule(part);
    if (!r) return null;
    // A rule replaces what came before on its own days; the small hours spilling into the next day are kept.
    spans = spans.flatMap((s) => {
      const kept = s.days.filter((x) => !r.days.includes(x));
      return kept.length ? [{ ...s, days: kept }] : [];
    });
    spans.push(...r.open);
  }
  return spans;
}

/** Per day, the hours outside the spans, as rules of `kind`. */
function outside(spans: Span[], kind: Rule["kind"], label: string): Rule[] {
  const rules: Rule[] = [];
  for (const day of ALL) {
    const open = spans.filter((s) => s.days.includes(day)).map((s) => [s.start, s.end] as const).sort((a, b) => a[0] - b[0]);
    let t = 0;
    for (const [s, e] of open) { if (s > t) rules.push({ kind, days: [day], start: t, end: s, label }); t = Math.max(t, e); }
    if (t < 24) rules.push({ kind, days: [day], start: t, end: 24, label });
  }
  return rules;
}

/** `maxstay` in hours: "2 hours", "90 minutes", "2 h", "30 min". Null when it can't be read. */
function maxstay(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|min|mins|minutes?)$/i.exec(text.trim());
  if (!m) return null;
  return /^m/i.test(m[2]!) ? Number(m[1]) / 60 : Number(m[1]);
}

/**
 * A site's rules from its OSM tags, the cautions for tags that couldn't be read, and whether any timetable tag was there.
 */
export function osmTimetable(tags: Record<string, string>): { rules: Rule[]; cautions: string[]; hasData: boolean } {
  const rules: Rule[] = [], cautions: string[] = [];
  const oh = tags.opening_hours, stay = tags.maxstay, fee = tags["fee:conditional"];
  if (oh) {
    const open = openSpans(oh);
    if (open) rules.push(...outside(open, "no", `Closed (opening hours ${oh})`));
    else cautions.push(`Opening hours not read: ${oh}`);
  }
  if (stay) {
    const h = maxstay(stay);
    if (h) rules.push({ kind: "limit", days: ALL, start: 0, end: 24, limitHours: h, label: `Max stay ${stay}` });
    else cautions.push(`Max stay not read: ${stay}`);
  }
  if (fee) {
    // "yes @ (Mo-Fr 08:00-18:00); no @ (...)": only the times the fee applies matter.
    const conditions = [...fee.matchAll(/yes\s*@\s*\(([^)]*)\)/g)].map((m) => openSpans(m[1]!));
    if (conditions.length && conditions.every(Boolean))
      rules.push(...conditions.flatMap((spans) => spans!.map((s) => ({ kind: "no" as const, ...s, label: `Fee applies (${fee})` }))));
    else cautions.push(`Fee times not read: ${fee}`);
  }
  return { rules, cautions, hasData: !!(oh || stay || fee) };
}
