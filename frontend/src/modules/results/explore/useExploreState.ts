import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useResults } from "../hooks";
import { useOfficeWithoutBrResult } from "../components/WithResults";
import type { Level } from "../../../api/models";
import { MAP_TYPES, type MapType } from "../../maps";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { childLevel as childLevelOf, defaultGeoAreaName, geoAreaLink } from "../../../lib/geo-areas";
import { defaultSystem } from "../../../lib/offices";
import { useFilter } from "../../../lib/filter-store";
import { useFavorites } from "../../accounts";

export type EvolutionAxisChoice = "t" | "pct_secoes";
export type EvolutionMetricChoice = "pct" | "votos" | "diferenca";

/**
 * State of the explore screen for one geo area: its result, the map and table options, and the
 * navigation that keeps the filter store in step with the URL.
 */
export function useExploreState(level: Level, id: string) {
  const filter = useEffectiveFilter();
  const navigate = useNavigate();
  const withoutBrResult = useOfficeWithoutBrResult(filter.cargo, level);
  const query = useResults(
    { turno: filter.turno, cargo: filter.cargo, nivel: level, id, t: filter.t },
    !withoutBrResult,
  );
  const proportional = (query.data?.office.voting_system ?? defaultSystem(filter.cargo)) === "proporcional";
  const [mapType, setMapType] = useState<MapType>("vencedores");
  const [allMunicipalities, setAllMunicipalities] = useState(false);
  const [axis, setAxis] = useState<EvolutionAxisChoice>("t");
  const [metric, setMetric] = useState<EvolutionMetricChoice>("pct");
  const { isFavorite, toggle } = useFavorites();
  const name = query.data?.geo_area.name ?? defaultGeoAreaName(level, id);
  const parent = query.data?.geo_area.breadcrumb?.[query.data.geo_area.breadcrumb.length - 2];
  const favorite = isFavorite("geo_area", `${level}:${id}`);

  /** Opens an area: the filter store follows it, except for the places and sections, which have their own pages. */
  const openArea = (areaLevel: Level, areaId: string, areaName?: string) => {
    if (areaLevel !== "polling_place" && areaLevel !== "section")
      useFilter.getState().setGeoArea(areaLevel, areaId, areaName);
    navigate(geoAreaLink(areaLevel, areaId));
  };

  return {
    filter,
    query,
    withoutBrResult,
    proportional,
    name,
    parent,
    favorite,
    toggleFavorite: () => toggle({ type: "geo_area", ref: `${level}:${id}`, label: name }),
    childLevel: childLevelOf(level),
    /** Level of the table's rows: the municipalities when the country lists all of them. */
    childrenParam: (level === "country" && allMunicipalities ? "municipality" : null) as Level | null,
    mapTypes: MAP_TYPES.filter((type) => !type.proportional || proportional),
    mapType,
    setMapType,
    allMunicipalities,
    setAllMunicipalities,
    axis,
    setAxis,
    metric,
    setMetric,
    openArea,
  };
}

export type ExploreState = ReturnType<typeof useExploreState>;
