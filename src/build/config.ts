// The build's thresholds, kept in one place so they're easy to change as the candidate criteria settle.

/** Kerb stretches shorter than this are dropped, so a van fits on every candidate. */
export const MIN_STRETCH_M = 8;

/** A plate snaps to the street it names within this distance, else to any centreline within SNAP_ANY_M. */
export const SNAP_NAMED_M = 30;
export const SNAP_ANY_M = 15;

/** Half the carriageway width by road class, for drawing the kerb beside the centreline. */
export const HALF_WIDTH_M: Record<string, number> = {
  motorway: 8, trunk: 7, primary: 7, secondary: 6, tertiary: 5, unclassified: 4, residential: 4, living_street: 3,
};

/** The orientation check: the winning reading's clean-pairing share must reach MIN_SHARE and beat the other by MARGIN. */
export const ORIENTATION = { MIN_SHARE: 0.6, MARGIN: 0.2 };

/**
 * The screen. Overnight: parked at 6pm you can stay 8 h, on at least one night.
 * Daytime: 4 continuous hours between 7am and 7pm, on at least one day.
 * Both are tested over a reference week inside St Lucia's Feb–Nov term, so month-limited rules apply.
 * A rule limited to months outside March would be missed; none in the snapshot is.
 */
export const SCREEN = {
  REFERENCE_MONDAY: "2026-03-02",
  OVERNIGHT_FROM_HOUR: 18,
  OVERNIGHT_HOURS: 8,
  DAY_FROM_HOUR: 7,
  DAY_TO_HOUR: 19,
  DAY_HOURS: 4,
};

/** Plates flagged multisignsegment within this distance along a kerb are read as one post. */
export const POST_M = 2;

/** Road classes, and slip roads, that get no unsigned kerb stretches: you can't stop on them at all. */
export const NO_UNSIGNED = { HIGHWAYS: ["motorway"], SLIP_ROADS: true };

/**
 * s 170 setbacks: no stopping within this distance of the nearest point of an intersecting road,
 * unless a sign says otherwise. Traffic signals count when they're within SIGNALS_NEAR_M of the intersection.
 */
export const SETBACK = { LIGHTS_M: 20, NO_LIGHTS_M: 10, SIGNALS_NEAR_M: 30 };

/** A yellow line or an OSM point belongs to a kerb when it's within this distance of it. */
export const KERB_NEAR_M = 6;

/**
 * Soft cautions, not trims. s 195: no stopping 20 m before an unsigned bus stop and 10 m after it.
 * A Bus Zone plate within BUS_ZONE_NEAR_M of the stop replaces the buffer. Crossings use s 172's 20 m and 10 m.
 */
export const BUS_STOP = { BEFORE_M: 20, AFTER_M: 10, BUS_ZONE_NEAR_M: 30 };
export const CROSSING = { BEFORE_M: 20, AFTER_M: 10 };

/** Frontage: sample the kerb every STEP_M and probe outward up to PROBE_M (across the road reserve) for the first zone. */
export const FRONTAGE = { STEP_M: 10, PROBE_M: 40, PROBE_STEP_M: 2 };

/**
 * Frontage tiers (the spec's Screen and ordering table), by City Plan 2014 zone or precinct code.
 * Tier 1 orders first. A code is matched in full first, then by its zone letters ("OS2" → "OS").
 * Zones the table doesn't name (centres, mixed use, high density, other community facilities) sit with tier 3.
 */
export const TIERS: Record<string, 1 | 2 | 3> = {
  OS: 1, SR: 1, EM: 1, CN: 1, SP: 1, LII: 1, MI: 1, GI: 1, HI: 1, SI: 1, IN: 1, SC1: 1,
  MDR: 2, LMR: 2, CF4: 2,
  LDR: 3, CR: 3,
};
export const OTHER_TIER = 3;

/** Frontage that excludes a candidate: CF5 Education purpose, and CF4 Community purpose with OSM amenity=kindergarten|childcare in it. */
export const EXCLUDED = { ZONES: ["CF5"], KINDERGARTEN_ZONES: ["CF4"], KINDERGARTEN: /^(kindergarten|childcare)$/ };

/**
 * The St Lucia Traffic Area: 2P, 7am–6pm Mon–Fri, February to November, except as signed.
 * Source: https://www.brisbane.qld.gov.au/transport-and-parking/parking/traffic-and-parking-permit-areas
 * and the St Lucia Traffic Area Regulated Parking Local Law 1998. The permit-area polygon carries no rules, so they're hard-coded here.
 */
export const ST_LUCIA_TRAFFIC_AREA = {
  NAME: "ST LUCIA TRAFFIC AREA",
  RULE: { kind: "limit" as const, days: [1, 2, 3, 4, 5], start: 7, end: 18, months: [2, 11] as [number, number], limitHours: 2,
    label: "St Lucia Traffic Area 2P MON-FRI:7am-6pm FEB-NOV" },
};
