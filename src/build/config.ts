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
