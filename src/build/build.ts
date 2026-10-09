// The build: snapshot inputs in, the candidates dataset and the build report out.
import type { Rule } from "../timetable/timetable.ts";
import { toXY, type Compass, type LonLat } from "./geo.ts";
import type { ToiletRecord } from "./inputs.ts";
import { CURRENT_IMAGERY, RUBRIC_VERSION } from "../evaluate/config.ts";
import { evaluationQueue, inherit, type CandidateEvaluation, type CurrentEvaluation, type PriorEvaluation } from "./evaluations.ts";
import { buildKerbs, suburbFinder, type KerbInput, type KerbReport, type Stretch } from "./kerbs.ts";
import { buildSites, type SiteInput, type SiteKind } from "./sites.ts";
import { maxStayHours, passesDaytime, passesOvernight } from "./screen.ts";
import { nearestToilets, type NearestToilet, type Toilet } from "./toilets.ts";
import type { Tier } from "./config.ts";
import type { Frontage } from "./frontage.ts";

/** The kinds of candidate: a kerb stretch, a parking area or an off-road site. */
export type CandidateKind = "kerb" | SiteKind;

export type Candidate = {
  id: string;
  kind: CandidateKind;
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
  tier: Tier | null;
  /** The nearest toilet in the toilets layer, measured from the nearest point of the candidate. */
  toilet: NearestToilet | null;
  /** A site's tenure label, such as "Public: council land" or "Freehold (owner unknown)". Null for a kerb, or when unknown. */
  tenure: string | null;
  /** QLD Roads and Tracks trafficability of an off-road site's track, such as "4WD". */
  trafficability: string | null;
  /** The evaluation this candidate has, made for it or carried over from an earlier build. Null when unevaluated. */
  evaluation: CandidateEvaluation | null;
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
  /** Site candidates by kind, how many have any timetable data (plates inside, or OSM time tags), and sites dropped by the screen. */
  sites: { parkingAreas: number; offRoad: number; withTimetable: number; failsScreen: number };
  /** Candidates with an evaluation, how many are current, how many carried over from another id, and how many are queued. */
  evaluations: { evaluated: number; current: number; carriedOver: number; queued: number };
};

export type BuildInput = KerbInput & SiteInput & {
  toilets?: ToiletRecord[];
  /** Off in tests that only look at plate reading. */
  screen?: boolean;
  /** The committed evaluations, to carry over to the rebuilt candidates. */
  evaluations?: PriorEvaluation[];
  /** The rubric and imagery an evaluation must have been made with to be current. Defaults to the batch's. */
  current?: CurrentEvaluation;
};

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

/** A candidate from a kerb stretch or site: the screen's results, its frontage and tier, and nothing nearby yet. */
function candidate(
  c: Omit<Candidate, "overnight" | "daytime" | "dayOnly" | "maxStayHours" | "frontage" | "tier" | "toilet" | "evaluation">,
  frontage: Frontage | null,
): Candidate {
  const overnight = passesOvernight(c), daytime = passesDaytime(c);
  const { tenure, trafficability, ...rest } = c;
  return {
    ...rest, overnight, daytime, dayOnly: daytime && !overnight, maxStayHours: maxStayHours(c),
    frontage: frontage && { zone: frontage.zone, name: frontage.name }, tier: frontage?.tier ?? null,
    toilet: null, tenure, trafficability, evaluation: null,
  };
}

export function build({
  screen: screening = true, toilets = [], evaluations = [], current = { rubric: RUBRIC_VERSION, imagery: CURRENT_IMAGERY }, ...input
}: BuildInput): { candidates: Candidate[]; toilets: Toilet[]; report: BuildReport } {
  const { stretches, report } = buildKerbs(input);
  const sites = buildSites(input);
  const candidates: Candidate[] = [];
  const outcomes = new Map(report.unparsed.map((u) => [u.text, { ...u, dropped: 0, normal: 0, unreadable: 0 }]));
  let failsScreen = 0, siteFailsScreen = 0;
  for (const s of stretches) {
    const { outcome, rules } = screening ? screen(s) : { outcome: "normal" as const, rules: s.rules };
    for (const text of s.unparsed) outcomes.get(text)![outcome]++;
    if (outcome === "dropped") { failsScreen++; continue; }
    candidates.push(candidate({
      id: `${s.link.id}-${s.side[0]}-${Math.round(s.from)}`, kind: "kerb", street: s.street, suburb: s.suburb, side: s.compass,
      line: s.line, lengthM: Math.round((s.to - s.from) * 10) / 10, rules, plates: s.plates,
      cautions: outcome === "unreadable" ? [...s.cautions, UNREADABLE] : s.cautions, lowConfidence: s.lowConfidence,
      tenure: null, trafficability: null,
    }, s.frontage));
  }
  const suburbOf = suburbFinder(input.signs);
  const timetabled = new Set<string>();
  for (const s of sites) {
    const c = candidate({
      id: s.id, kind: s.kind, street: s.name, suburb: suburbOf(toXY(s.point)), side: null, line: s.line, lengthM: 0,
      rules: s.rules, plates: s.plates, cautions: s.cautions, lowConfidence: false, tenure: s.tenure, trafficability: s.trafficability,
    }, s.frontage);
    if (screening && !c.overnight && !c.daytime) { siteFailsScreen++; continue; }
    if (s.hasTimetable) timetabled.add(s.id);
    candidates.push(c);
  }
  for (const c of candidates) c.evaluation = inherit(c, evaluations, current);
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
      sites: {
        parkingAreas: candidates.filter((c) => c.kind === "parking-area").length,
        offRoad: candidates.filter((c) => c.kind === "off-road").length,
        withTimetable: timetabled.size,
        failsScreen: siteFailsScreen,
      },
      evaluations: {
        evaluated: candidates.filter((c) => c.evaluation).length,
        current: candidates.filter((c) => c.evaluation?.current).length,
        carriedOver: candidates.filter((c) => c.evaluation && c.evaluation.from !== c.id).length,
        queued: evaluationQueue(candidates).reduce((n, g) => n + g.ids.length, 0),
      },
    },
  };
}
