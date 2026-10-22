import { useCallback, useMemo } from "react";
import type { Layer } from "@deck.gl/core";
import type { ChildCandidateDto, ChildItemDto, Level, MapPollingPlaceDto } from "../../api/models";
import { buildMapLayers } from "./mapLayers";
import { pollingPlaceColor, regionColor, type CandidateColorFn } from "./mapColors";
import type { FeatureGeo } from "./lib";
import type { MapMode } from "./mapScope";
import type { MapScale } from "./mapScale";
import type { MapType } from "./types";

export interface MapLayersArgs {
  type: MapType;
  mode: MapMode;
  level: Level;
  id: string;
  dark: boolean;
  zoom: number;
  highlight: string | null;
  candidateColor: CandidateColorFn;
  candidateA: string | null;
  candidateB: string | null;
  candidates: ChildCandidateDto[] | undefined;
  scale: MapScale;
  itemsByKey: Map<string, ChildItemDto>;
  features: FeatureGeo[];
  places: MapPollingPlaceDto[];
  hasPlaces: boolean;
  dataVersion: string;
  placesUpdatedAt: number;
}

/** The layers of the map and the two colors of the comparison (A and B). */
export function useMapLayers(a: MapLayersArgs) {
  const {
    type,
    mode,
    level,
    id,
    dark,
    zoom,
    highlight,
    candidateColor,
    candidateA,
    candidateB,
    candidates,
    scale,
  } = a;
  const { itemsByKey, features, places, hasPlaces, dataVersion, placesUpdatedAt } = a;
  const colorA = candidateA
    ? candidateColor(candidateA, candidates?.find((c) => c.tse_candidate_id === candidateA)?.color)
    : undefined;
  const colorB = candidateB
    ? candidateColor(candidateB, candidates?.find((c) => c.tse_candidate_id === candidateB)?.color)
    : undefined;

  const regionFill = useCallback(
    (key: string) =>
      regionColor(itemsByKey.get(key), {
        type,
        dark,
        highlight,
        candidateColor,
        candidateA,
        candidateB,
        scale,
        colorA,
        colorB,
      }),
    [type, dark, highlight, candidateColor, candidateA, candidateB, scale, colorA, colorB, itemsByKey],
  );
  const placeFill = useCallback(
    (place: MapPollingPlaceDto) => pollingPlaceColor(place, type, highlight, candidateColor),
    [type, highlight, candidateColor],
  );

  const layers: Layer[] = useMemo(
    () =>
      buildMapLayers({
        mode,
        type,
        level,
        id,
        dark,
        zoom,
        features,
        itemsByKey,
        regionFill,
        hasPlaces,
        places,
        placeFill,
        version: dataVersion,
        placesUpdatedAt,
      }),
    [
      mode,
      type,
      level,
      id,
      dark,
      zoom,
      features,
      itemsByKey,
      regionFill,
      hasPlaces,
      places,
      placeFill,
      dataVersion,
      placesUpdatedAt,
    ],
  );

  return { layers, colorA, colorB };
}
