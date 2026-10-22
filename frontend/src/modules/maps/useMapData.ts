import { useMemo } from "react";
import type { ChildItemDto, ChildrenDto, Level } from "../../api/models";
import { useChildren } from "../results";
import { useLive, topic } from "../realtime";
import { useMapPollingPlaces, useMunicipalityMesh, useStateMesh } from "./hooks";
import type { FeatureGeo } from "./lib";
import type { MapMode, MapScope } from "./mapScope";
import { mapTargetOf } from "./mapTarget";
import { useCandidateSelection } from "./useCandidateSelection";
import type { MapType } from "./types";

export interface MapDataArgs {
  type: MapType;
  level: Level;
  id: string;
  office: number;
  round: number;
  t: string | null;
  scope: MapScope;
  candidateA?: string | null;
  candidateB?: string | null;
  /** the candidate highlighted in the legend, or null */
  highlight: string | null;
}

/** Every query and derived value of the map: the regions, the places, the selectors and the framing. */
export function useMapData(args: MapDataArgs) {
  const { type, level, id, office, round, t, scope, highlight } = args;
  const { mode, uf, munId, childLevel } = scope;
  const needsValues = type === "desempenho" || type === "comparativo";
  const needsPlaces = mode === "pontos" || type === "locais";

  const stateMesh = useStateMesh();
  const municipalityMesh = useMunicipalityMesh(mode !== "uf");
  const base = useChildren(
    { turno: round, cargo: office, nivel: level, id, t, filhos: childLevel },
    mode !== "pontos",
  );
  const selection = useCandidateSelection(args.candidateA, args.candidateB, base.data?.candidates);
  const { efA, efB } = selection;

  const requested = type === "desempenho" ? [efA] : type === "comparativo" ? [efA, efB] : [];
  const withValues = useChildren(
    {
      turno: round,
      cargo: office,
      nivel: level,
      id,
      t,
      filhos: childLevel,
      candidatos: requested.filter((x): x is string => !!x),
    },
    mode !== "pontos" && needsValues && !!efA,
  );
  const places = useMapPollingPlaces(
    {
      round,
      office,
      uf: mode === "pontos" ? null : uf,
      municipality: mode === "pontos" ? munId : null,
      t,
    },
    needsPlaces,
  );
  // the outline of the municipality (points mode): the IBGE code comes from the state's municipality list
  const stateMunicipalities = useChildren(
    { turno: round, cargo: office, nivel: "state", id: uf ?? "", t: null },
    mode === "pontos" && !!uf,
  );
  // the winners per candidate across Brazil, for the legend of a highlighted candidate on the state map
  const countryWinners = useChildren(
    { turno: round, cargo: office, nivel: "country", id: "br", t, filhos: "municipality" },
    mode === "uf" && !!highlight && type === "vencedores",
  );

  useLive([
    mode !== "pontos" && topic.children(round, office, level, id, childLevel),
    mode === "pontos" && munId && topic.pollingPlaces(round, office, munId),
  ]);

  const data: ChildrenDto | undefined = (needsValues ? withValues.data : undefined) ?? base.data;
  const candidates = base.data?.candidates;
  const features: FeatureGeo[] = useMemo(() => {
    if (mode === "uf") return stateMesh.data?.features ?? [];
    if (mode === "mun") {
      if (!municipalityMesh.data) return [];
      return level === "country"
        ? municipalityMesh.data.features
        : (municipalityMesh.data.byState.get(uf ?? "") ?? []);
    }
    const item = stateMunicipalities.data?.items.find((i) => i.id === munId);
    const feature = item?.ibge_code ? municipalityMesh.data?.byId.get(String(item.ibge_code)) : undefined;
    return feature ? [feature] : [];
  }, [mode, level, uf, stateMesh.data, municipalityMesh.data, stateMunicipalities.data, munId]);

  const itemsByKey = useMemo(() => {
    const map = new Map<string, ChildItemDto>();
    for (const item of data?.items ?? []) map.set(keyOfItem(item, mode), item);
    return map;
  }, [data, mode]);

  const placeItems = places.data?.items;
  const target = useMemo(
    () => mapTargetOf(mode, level, id, features, placeItems ?? []),
    [mode, level, id, features, placeItems],
  );

  const loading =
    (mode === "uf" && stateMesh.isLoading) ||
    (mode !== "uf" && municipalityMesh.isLoading) ||
    (mode !== "pontos" && base.isLoading) ||
    (needsPlaces && places.isLoading);
  const error =
    (mode !== "pontos" ? base.error : null) ??
    (needsPlaces ? places.error : null) ??
    stateMesh.error ??
    municipalityMesh.error;

  return {
    ...selection,
    mode,
    needsValues,
    needsPlaces,
    candidates,
    data,
    dataVersion: data ? `${data.items.length}:${base.dataUpdatedAt + withValues.dataUpdatedAt}` : "0",
    features,
    itemsByKey,
    places,
    countryWinners,
    target,
    loading,
    error,
    base,
  };
}

/** Join key of an item: the state code for the states map, the IBGE code for municipalities. */
function keyOfItem(item: ChildItemDto, mode: MapMode): string {
  return mode === "uf" ? (item.state_code || item.id).toLowerCase() : String(item.ibge_code ?? "");
}
