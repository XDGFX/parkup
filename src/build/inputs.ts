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

export type Snapshot = { takenAt: string; signs: SignRecord[]; ways: OsmWay[]; nodes: OsmNode[]; lines: KerbLine[]; areas: PermitArea[]; zones: Zone[] };

/** An OSM point: traffic signals, crossings, bus stops, and schools and kindergartens (as their centre). */
export type OsmNode = { id: number; lon: number; lat: number; tags: Record<string, string> };

/** A painted line at the kerb from BCC "Parking — Line locations". The snapshot keeps only yellow no-stopping lines. */
export type KerbLine = { assetid: string; coords: [lon: number, lat: number][] };

type Rings = [lon: number, lat: number][][];

/** A City Plan 2014 zone polygon. `code` is the zone or precinct code, e.g. "LDR", "CF5", "OS2"; road reserves have none. */
export type Zone = { code: string; name: string; rings: Rings };

/** A BCC regulated permit parking area, such as the St Lucia Traffic Area. */
export type PermitArea = { name: string; rings: Rings };

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

/** An OSM car park (`amenity=parking`): an outline (a way, or a multipolygon's outer rings) or, for a node, a point. */
export type OsmArea = { type: "node" | "way" | "relation"; id: number; tags: Record<string, string>; rings: [lon: number, lat: number][][] | null; lon?: number; lat?: number };

/** A line from BCC "Park — Tracks and Trails": `ACCESS ROAD`, `MULTI-USE ACCESS` or `MANAGEMENT ACCESS ONLY`. */
export type TrailLine = { id: string; itemType: string; park: string | null; description: string | null; coords: [lon: number, lat: number][] };

/** A track from QLD Roads and Tracks, for its `trafficability` (such as "4WD"). */
export type QldTrack = { trafficability: string | null; surface: string | null; coords: [lon: number, lat: number][] };

/** A QLD cadastre point query at a site's point. Road parcels have no tenure and a "Road Type Parcel" type. */
export type Parcel = { lon: number; lat: number; lotplan: string | null; tenure: string | null; parcelType: string | null };

/** A BCC Council Vegetation polygon: land the council owns or controls. */
export type CouncilLand = { rings: [lon: number, lat: number][][] };
