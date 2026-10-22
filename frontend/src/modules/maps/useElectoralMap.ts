import { useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { useComputedColorScheme } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import type { Level } from "../../api/models";
import { useEffectiveFilter } from "../../lib/effective-filter";
import { usePrefs } from "../../lib/prefs-store";
import { useCandidateColor } from "../../lib/useColor";
import { mapScaleOf } from "./mapScale";
import { mapScopeOf } from "./mapScope";
import type { MapType } from "./types";
import { useLegendData } from "./useLegendData";
import { useMapData } from "./useMapData";
import { useMapLayers } from "./useMapLayers";
import { useMapPicking, type SelectHandler } from "./useMapPicking";
import { useBasemapStyle, useFitToTarget } from "./useMapViewport";

export interface ElectoralMapCanvasProps {
  /** kind of map (stored in the URL and in widgets) */
  kind: MapType;
  level: Level;
  id: string;
  /** with level=country: draws every municipality of Brazil instead of the states */
  allMunicipalities?: boolean;
  candidateA?: string | null;
  candidateB?: string | null;
  onCandidatesChange?: (a: string | null, b: string | null) => void;
  /** called when the user clicks a region or a polling place */
  onSelect?: SelectHandler;
  /** legend shown (default true) */
  legend?: boolean;
  candidateSelector?: boolean;
  basemap?: boolean;
  /** height of the map box (default 100%) */
  height?: number | string;
  /** overrides the office of the effective filter */
  cargo?: number;
}

/** Everything the map view needs, computed once per render: queries, layers, legend and interaction. */
export function useElectoralMap(props: ElectoralMapCanvasProps) {
  const { kind: type, level, id, allMunicipalities, onSelect, candidateSelector = true } = props;
  const filter = useEffectiveFilter();
  const office = props.cargo ?? filter.cargo;
  const candidateColor = useCandidateColor();
  const dark = useComputedColorScheme("dark") === "dark";
  const basemapPreference = usePrefs((s) => s.basemap);
  const mapRef = useRef<MapRef | null>(null);
  const { ref: boxRef, width: boxWidth, height: boxHeight } = useElementSize();
  const [zoom, setZoom] = useState(3.4);
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => setHighlight(null), [level, id, office, type]);

  const view = useMapData({
    type,
    level,
    id,
    office,
    round: filter.turno,
    t: filter.t,
    scope: mapScopeOf(level, id, allMunicipalities),
    candidateA: props.candidateA,
    candidateB: props.candidateB,
    highlight,
  });
  const { mode, efA, efB, data, places } = view;
  const items = data?.items;
  const scale = useMemo(() => mapScaleOf(type, items ?? [], efA, efB), [items, type, efA, efB]);
  const basemap = useBasemapStyle(props.basemap ?? basemapPreference, dark);
  const picking = useMapPicking({ mode, itemsByKey: view.itemsByKey, onSelect, mapRef });
  const { layers, colorA, colorB } = useMapLayers({
    type,
    mode,
    level,
    id,
    dark,
    zoom,
    highlight,
    candidateColor,
    candidateA: efA,
    candidateB: efB,
    candidates: view.candidates,
    scale,
    itemsByKey: view.itemsByKey,
    features: view.features,
    places: places.data?.items ?? [],
    hasPlaces: view.needsPlaces,
    dataVersion: view.dataVersion,
    placesUpdatedAt: places.dataUpdatedAt,
  });
  const framing = useFitToTarget(mapRef, view.target);
  const legend = useLegendData(mode, places.data, data, view.countryWinners.data, candidateColor);

  const candidateOptions = (view.candidates ?? []).map((c) => ({
    value: c.tse_candidate_id,
    label: `${c.ballot_name} (${c.ballot_number}) · ${c.party_abbreviation}`,
  }));
  const candidateName = (candidate: string | null) =>
    view.candidates?.find((c) => c.tse_candidate_id === candidate)?.ballot_name;

  return {
    ...view,
    type,
    props,
    candidateSelector,
    dark,
    zoom,
    setZoom,
    highlight,
    setHighlight,
    mapRef,
    boxRef,
    boxSize: [boxWidth, boxHeight] as [number, number],
    candidateColor,
    basemap,
    picking,
    layers,
    colorA,
    colorB,
    framing,
    legend,
    scale,
    candidateOptions,
    unit: mode === "uf" ? "UFs" : mode === "mun" ? "municípios" : "locais",
    candidateName,
  };
}

export type ElectoralMapModel = ReturnType<typeof useElectoralMap>;
