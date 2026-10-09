// The build's inputs, as pinned by the snapshot. Tests build these by hand.

/** One plate from BCC "Parking — Sign locations". Several plates can share a post (and a point). */
export type SignRecord = {
  assetid: string;
  street: string;
  suburb: string;
  lon: number;
  lat: number;
  /** The arrow on the plate: "Left", "Right", "Bi-Directional" (a repeater), "Not applicable" or "unknown". */
  signdirection: string | null;
  bccallocationcode: string | null;
  /** 1 when the plate shares a post with others. */
  multisignsegment: number | null;
  parkingrestrictiontype: string | null;
  parkingrestrictiondaysandtimes: string | null;
  parkingrestrictiondescription: string | null;
};

/** An OSM road centreline, with node ids so intersections can be found. */
export type OsmWay = {
  id: number;
  tags: Record<string, string>;
  nodes: number[];
  coords: [lon: number, lat: number][];
};

export type Snapshot = { takenAt: string; signs: SignRecord[]; ways: OsmWay[] };

/** One toilet from BCC's copy of the National Public Toilet Map, stations and service stations included. */
export type ToiletRecord = {
  facilityid: string;
  name: string;
  facilitytype: string | null;
  address: string | null;
  lon: number;
  lat: number;
  /** Free text, such as "OPEN: Daylight hours", "OPEN: 24 hours" or "OPEN: Mon-Fri 6am-10pm". */
  openinghours: string | null;
};
