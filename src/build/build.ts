// The build: snapshot inputs in, the candidates dataset and the build report out.
import type { Rule } from "../timetable/timetable.ts";
import type { LonLat } from "./geo.ts";
import type { OsmWay, SignRecord } from "./inputs.ts";
import { buildKerbs, type KerbReport } from "./kerbs.ts";
import { maxStayHours, passesDaytime, passesOvernight } from "./screen.ts";

export type Candidate = {
  id: string;
  kind: "kerb";
  street: string;
  suburb: string;
  /** The compass side of the street the kerb is on. */
  side: "north" | "south" | "east" | "west";
  line: LonLat[];
  lengthM: number;
  rules: Rule[];
  /** Raw plate text, for the card. */
  plates: string[];
  cautions: string[];
  lowConfidence: boolean;
  overnight: boolean;
  daytime: boolean;
  /** Passes the daytime test but no night. */
  dayOnly: boolean;
  maxStayHours: number | null;
};

export type BuildReport = KerbReport & {
  plates: number;
  stretches: number;
  failsScreen: number;
  candidates: number;
  lowConfidence: number;
  dayOnly: number;
};

export type BuildInput = { signs: SignRecord[]; ways: OsmWay[]; /** Off in tests that only look at plate reading. */ screen?: boolean };

export function build({ signs, ways, screen = true }: BuildInput): { candidates: Candidate[]; report: BuildReport } {
  const { stretches, report } = buildKerbs(signs, ways);
  const candidates: Candidate[] = [];
  let failsScreen = 0;
  // A stable order: by street, then along each link.
  stretches.sort((a, b) => a.street.localeCompare(b.street) || a.link.id.localeCompare(b.link.id) || a.side.localeCompare(b.side) || a.from - b.from);
  for (const s of stretches) {
    const overnight = passesOvernight(s), daytime = passesDaytime(s);
    if (screen && !overnight && !daytime) { failsScreen++; continue; }
    candidates.push({
      id: `${s.link.id}-${s.side[0]}-${Math.round(s.from)}`,
      kind: "kerb",
      street: s.street,
      suburb: s.suburb,
      side: s.compass,
      line: s.line,
      lengthM: Math.round((s.to - s.from) * 10) / 10,
      rules: s.rules,
      plates: s.plates,
      cautions: s.lowConfidence ? ["Low-confidence stretch"] : [],
      lowConfidence: s.lowConfidence,
      overnight,
      daytime,
      dayOnly: daytime && !overnight,
      maxStayHours: maxStayHours(s),
    });
  }
  return {
    candidates,
    report: {
      plates: signs.length, ...report, stretches: stretches.length, failsScreen, candidates: candidates.length,
      lowConfidence: candidates.filter((c) => c.lowConfidence).length,
      dayOnly: candidates.filter((c) => c.dayOnly).length,
    },
  };
}
