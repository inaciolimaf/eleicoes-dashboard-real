import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

/** [minLon, minLat, maxLon, maxLat] */
export type BBox = [number, number, number, number];

/** Properties of a feature in the static GeoJSON files (`uf` is upper case; `id` is the IBGE code). */
export interface GeoProps {
  uf: string;
  id?: string;
  nome?: string;
}

/** A map feature with its bounding box and the key that joins it to the API data. */
export type FeatureGeo = Feature<Geometry, GeoProps> & { bbox: BBox; key: string };

export const BRAZIL_BBOX: BBox = [-74.2, -33.9, -34.6, 5.4];

/** Grows `b` so it contains every position found in `coords` (any GeoJSON nesting). */
export function extendBBox(b: BBox, coords: unknown) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number") {
    const p = coords as Position;
    if (p[0] < b[0]) b[0] = p[0];
    if (p[1] < b[1]) b[1] = p[1];
    if (p[0] > b[2]) b[2] = p[0];
    if (p[1] > b[3]) b[3] = p[1];
    return;
  }
  for (const c of coords) extendBBox(b, c);
}

export function bboxOfGeometry(g: Geometry): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  if (g.type === "GeometryCollection")
    for (const gg of g.geometries) extendBBox(b, (gg as { coordinates?: unknown }).coordinates);
  else extendBBox(b, (g as { coordinates: unknown }).coordinates);
  return b;
}

/** Box that contains every box of the list; null for an empty list. */
export function unionBBox(boxes: BBox[]): BBox | null {
  if (!boxes.length) return null;
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const x of boxes) {
    b[0] = Math.min(b[0], x[0]);
    b[1] = Math.min(b[1], x[1]);
    b[2] = Math.max(b[2], x[2]);
    b[3] = Math.max(b[3], x[3]);
  }
  return Number.isFinite(b[0]) ? b : null;
}

/** Box of a set of points, widened to at least 0.01 degrees per side so a single point still fits. */
export function bboxOfPoints(points: { lat: number; lon: number }[]): BBox | null {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    b[0] = Math.min(b[0], p.lon);
    b[1] = Math.min(b[1], p.lat);
    b[2] = Math.max(b[2], p.lon);
    b[3] = Math.max(b[3], p.lat);
  }
  if (!Number.isFinite(b[0])) return null;
  if (b[2] - b[0] < 0.01) {
    b[0] -= 0.01;
    b[2] += 0.01;
  }
  if (b[3] - b[1] < 0.01) {
    b[1] -= 0.01;
    b[3] += 0.01;
  }
  return b;
}

export interface StateMesh {
  features: FeatureGeo[];
  byKey: Map<string, FeatureGeo>;
}

export interface MunicipalityMesh {
  features: FeatureGeo[];
  byId: Map<string, FeatureGeo>;
  byState: Map<string, FeatureGeo[]>;
}

/** Normalizes a GeoJSON collection: drops features without geometry, adds the box and the join key. */
export function prepareMesh(
  collection: FeatureCollection<Geometry | null, GeoProps>,
  keyOf: (p: GeoProps) => string,
): FeatureGeo[] {
  const out: FeatureGeo[] = [];
  for (const f of collection.features) {
    if (!f.geometry) continue;
    const props = { ...f.properties, uf: String(f.properties?.uf ?? "").toUpperCase() };
    out.push({
      ...(f as Feature<Geometry, GeoProps>),
      properties: props,
      bbox: bboxOfGeometry(f.geometry),
      key: keyOf(props),
    });
  }
  return out;
}
