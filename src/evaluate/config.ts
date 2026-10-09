// The evaluation batch's thresholds, kept in one place.
import { readFileSync } from "node:fs";

/** Code rule-outs applied after the agent runs. */
export const RULE_OUT = {
  /** A dwelling this close to the best section makes the verdict poor. */
  DWELLING_M: 10,
};

/** A best section lower than this above sea level is flagged as low-lying ground. */
export const LOW_LYING_M = 5;

/** The rubric's version, from its first line, e.g. "v5". */
export const RUBRIC_VERSION = /rubric (v\d+)/.exec(readFileSync(new URL("./rubric.md", import.meta.url), "utf8"))![1]!;

/** Context fetch: imagery chunks, padding, resolution and the DEM step. */
export const FETCH = {
  CHUNK_M: 150,
  PAD_M: 30,
  M_PER_PX: 0.15,
  MAX_PX: 1600,
  DEM_STEP_M: 5,
  /** Signs this close to the kerb line are listed. */
  SIGN_M: 15,
  /** Buildings this close to the line are listed (a point looks further, since a pin is approximate). */
  BUILDING_M: 60,
  BUILDING_POINT_M: 100,
  /** A point candidate is shown in a box this far each way (the agent looks for the real spot within 100 m), and its slope read along lines this long. */
  POINT_BOX_M: 100,
  POINT_SLOPE_M: 20,
  /** Gates and access ways are searched this far around the candidate. */
  ACCESS_M: 300,
};

/** OSM building values that count as a home for the dwelling rule-out. `building=yes` doesn't: it's as often a shed or clubhouse. */
export const DWELLINGS = new Set([
  "house", "detached", "semidetached_house", "terrace", "residential", "apartments", "bungalow", "dormitory", "farm",
  "static_caravan", "cabin", "houseboat",
]);
