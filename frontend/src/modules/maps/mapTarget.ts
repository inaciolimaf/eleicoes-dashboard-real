import type { Level, MapPollingPlaceDto } from "../../api/models";
import { BRAZIL_BBOX, bboxOfPoints, unionBBox, type BBox, type FeatureGeo } from "./lib";
import type { MapMode } from "./mapScope";

/**
 * The box the map frames: the whole country, the union of the drawn regions, or the polling places
 * of the selected zone or place (falling back to the regions, then to every place).
 */
export function mapTargetOf(
  mode: MapMode,
  level: Level,
  id: string,
  features: FeatureGeo[],
  places: MapPollingPlaceDto[],
): BBox | null {
  if (mode === "uf" || (mode === "mun" && level === "country")) return BRAZIL_BBOX;
  if (mode === "mun") return unionBBox(features.map((f) => f.bbox));
  const inScope = places.filter((place) => {
    if (level === "zone") return place.id.startsWith(id);
    if (level === "polling_place") return place.id === id;
    return true;
  });
  const coords = (place: MapPollingPlaceDto) => ({ lat: place.lat ?? NaN, lon: place.lon ?? NaN });
  if ((level === "polling_place" || level === "zone") && inScope.length)
    return bboxOfPoints(inScope.map(coords));
  return features[0]?.bbox ?? bboxOfPoints((inScope.length ? inScope : places).map(coords));
}
