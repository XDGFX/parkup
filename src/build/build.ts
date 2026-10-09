// The build: snapshot inputs in, the candidates dataset and the build report out.
import type { Rule } from "../timetable/timetable.ts";
import type { Compass, LonLat } from "./geo.ts";
import type { ToiletRecord } from "./inputs.ts";
import { buildKerbs, type KerbInput, type KerbReport, type Stretch } from "./kerbs.ts";
import { buildSites, type SiteInput, type SiteKind } from "./sites.ts";
import { maxStayHours, passesDaytime, passesOvernight } from "./screen.ts";
import { nearestToilets, type NearestToilet, type Toilet } from "./toilets.ts";

export type Candidate = {
  id: string;
  kind: "kerb" | SiteKind;
  /** The street a kerb is on, or a site's name. */
  street: string;
  suburb: string;
  /** The compass side of the street the kerb is on. Null for a site. */
  side: Compass | null;
  /** A kerb's line, a car park's outline (a closed ring), or an off-road site's single point. */
  line: LonLat[];
  lengthM: number;
  rules: Rule[];
  /** Raw plate text, for the card. Empty for an unsigned kerb. */
  plates: string[];
  cautions: string[];
  lowConfidence: boolean;
  overnight: boolean;
  daytime: boolean;
  /** Passes the daytime test but no night. */
  dayOnly: boolean;
  maxStayHours: number | null;
  /** The City Plan zone the kerb faces, e.g. "OS1" or "LDR", or null when the probe found none. */
  frontage: { zone: string; name: string } | null;
  /** 1 orders first. Null when there's no frontage, which orders last. */
  tier: 1 | 2 | 3 | null;
  /** The nearest toilet in the toilets layer, measured from the nearest point of the candidate. */
  toilet: NearestToilet | null;
};

/** What became of the stretches governed by an unreadable plate. */
export type UnparsedOutcome = { text: string; count: number; dropped: number; normal: number; unreadable: number };

export type BuildReport = Omit<KerbReport, "unparsed"> & {
  plates: number;
  stretches: number;
  unsigned: number;
  failsScreen: number;
  candidates: number;
  lowConfidence: number;
  dayOnly: number;
  byTier: Record<"1" | "2" | "3" | "none", number>;
  unparsed: UnparsedOutcome[];
};

export type BuildInput = KerbInput & SiteInput & { toilets?: ToiletRecord[]; /** Off in tests that only look at plate reading. */ screen?: boolean };

export const UNREADABLE = "Unreadable sign: it may restrict parking here";

type Outcome = "dropped" | "normal" | "unreadable";

/**
 * The screen, reading unreadable plates both ways: strictly (the rule always applies) and leniently (it never does).
 * Fails leniently: dropped. Passes strictly: a normal candidate. Passes only leniently: a candidate with a caution.
 */
function screen(s: Stretch): { outcome: Outcome; rules: Rule[] } {
  const passes = (rules: Rule[]) => passesOvernight({ rules }) || passesDaytime({ rules });
  if (passes(s.rules)) return { outcome: "normal", rules: s.rules };
  if (s.unparsed.length && passes(s.lenientRules)) return { outcome: "unreadable", rules: s.lenientRules };
  return { outcome: "dropped", rules: s.rules };
}

export function build({ screen: screening = true, toilets = [], ...input }: BuildInput): { candidates: Candidate[]; toilets: Toilet[]; report: BuildReport } {
  const { stretches, report } = buildKerbs(input);
  const sites = buildSites(input);
  const candidates: Candidate[] = [];
  const outcomes = new Map(report.unparsed.map((u) => [u.text, { ...u, dropped: 0, normal: 0, unreadable: 0 }]));
  let failsScreen = 0;
  for (const s of stretches) {
    const { outcome, rules } = screening ? screen(s) : { outcome: "normal" as const, rules: s.rules };
    for (const text of s.unparsed) outcomes.get(text)![outcome]++;
    if (outcome === "dropped") { failsScreen++; continue; }
    const overnight = passesOvernight({ rules }), daytime = passesDaytime({ rules });
    candidates.push({
      id: `${s.link.id}-${s.side[0]}-${Math.round(s.from)}`,
      kind: "kerb",
      street: s.street,
      suburb: s.suburb,
      side: s.compass,
      line: s.line,
      lengthM: Math.round((s.to - s.from) * 10) / 10,
      rules,
      plates: s.plates,
      cautions: outcome === "unreadable" ? [...s.cautions, UNREADABLE] : s.cautions,
      lowConfidence: s.lowConfidence,
      overnight,
      daytime,
      dayOnly: daytime && !overnight,
      maxStayHours: maxStayHours({ rules }),
      frontage: s.frontage && { zone: s.frontage.zone, name: s.frontage.name },
      tier: s.frontage?.tier ?? null,
      toilet: null,
    });
  }
  for (const s of sites) {
    const rules = s.rules, overnight = passesOvernight({ rules }), daytime = passesDaytime({ rules });
    candidates.push({
      id: s.id, kind: s.kind, street: s.name, suburb: "", side: null, line: s.line, lengthM: 0,
      rules, plates: s.plates, cautions: s.cautions, lowConfidence: false,
      overnight, daytime, dayOnly: daytime && !overnight, maxStayHours: maxStayHours({ rules }),
      frontage: null, tier: null, toilet: null,
    });
  }
  // Best frontage first, untagged car parks after the rest of their tier; then a stable order by street, side and position along the kerb.
  const unknownAccess = new Set(sites.filter((s) => !s.accessKnown).map((s) => s.id));
  const demoted = (c: Candidate) => (unknownAccess.has(c.id) ? 1 : 0);
  candidates.sort((a, b) => (a.tier ?? 4) - (b.tier ?? 4) || demoted(a) - demoted(b) || a.street.localeCompare(b.street) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const { nearest, layer } = nearestToilets(candidates.map((c) => c.line), toilets);
  candidates.forEach((c, i) => (c.toilet = nearest[i]!));
  const tierCount = (t: Candidate["tier"]) => candidates.filter((c) => c.tier === t).length;
  return {
    candidates,
    toilets: layer,
    report: {
      plates: input.signs.length, ...report, stretches: stretches.length,
      unsigned: stretches.filter((s) => !s.signed).length,
      failsScreen, candidates: candidates.length,
      lowConfidence: candidates.filter((c) => c.lowConfidence).length,
      dayOnly: candidates.filter((c) => c.dayOnly).length,
      byTier: { 1: tierCount(1), 2: tierCount(2), 3: tierCount(3), none: tierCount(null) },
      unparsed: [...outcomes.values()],
    },
  };
}
