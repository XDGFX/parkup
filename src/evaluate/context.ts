// What the batch gathers for one candidate before an agent evaluates it. Written to context.json, which the
// agent reads and the post-processing step uses to compute facts at the agent's best section.
import type { LonLat } from "../build/geo.ts";

export type EsriCapture = { date: string; resolution_m: number; sensor: string };
export type QldCapture = { dataset: string; start: string; end: string; resolution_m: number };

export type Chunk = {
  chunk: number;
  /** Metres along the candidate's line that this image covers (0 and 0 for a point). */
  from_m: number;
  to_m: number;
  length_m: number;
  /** Image paths relative to the repository root, in the gitignored imagery cache. */
  images: { esri: string | null; qld: string };
  esri_capture: EsriCapture | null;
  qld_capture: QldCapture;
  ground_size_m: [number, number];
  image_px: [number, number];
};

export type Building = {
  building: string;
  name: string | null;
  /** A house, apartment or other home, judged from its OSM tags. */
  dwelling: boolean;
  /** Distance from the candidate's line (or point), and where along it the building is closest. */
  metres: number;
  at_m: number;
  outline: LonLat[];
};

export type Gate = {
  barrier: string;
  locked: string | null;
  lon: number;
  lat: number;
  metres: number;
  /** The gate sits on every mapped way between a public road and the candidate. */
  on_only_access: boolean;
};

export type DemSample = { lon: number; lat: number; elevation_m: number | null; /** Metres along the line; for a point, along its own line. */ at_m: number; line: number };

export type Context = {
  id: string;
  street: string;
  suburb: string;
  /** kerb: a kerb line. outline: the boundary of a parking area. point: a single point (a pin or a track entrance). */
  kind: "kerb" | "outline" | "point";
  /** The kerb line, the outline, or a single point. Distances along it start at its first vertex. */
  line: LonLat[];
  length_m: number;
  side?: string;
  osm_tags: Record<string, string>;
  signs: Record<string, unknown>[];
  buildings: Building[];
  gates: Gate[];
  slope: {
    step_m: number;
    samples: DemSample[];
    min_elevation_m: number | null;
    max_elevation_m: number | null;
    mean_grade_pct: number | null;
    max_grade_pct: number | null;
  };
  /** The nearest mapped waterway, for low-lying ground. */
  waterway?: { name: string | null; metres: number } | null;
  /** OSM car parks (amenity=parking) within 100 m, nearest first. */
  mapped_parking?: { name: string | null; metres: number; access: string | null; fee: string | null; surface: string | null }[];
  /** For a point: OSM service roads and tracks within 100 m, nearest first. */
  mapped_ways?: { highway: string; service: string | null; name: string | null; surface: string | null; access: string | null; metres: number }[];
  chunks: Chunk[];
};
