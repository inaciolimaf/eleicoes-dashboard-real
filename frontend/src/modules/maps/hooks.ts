import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection, Geometry } from "geojson";
import { api } from "../../api/client";
import type { MapPollingPlacesDto } from "../../api/models";
import { qk, timeQueryOptions, useWsOpen } from "../../api/query-keys";
import { type GeoProps, type FeatureGeo, type StateMesh, type MunicipalityMesh, prepareMesh } from "./lib";

/** The polling places of a map scope (a state, a municipality, or the country with `municipality`). */
export function useMapPollingPlaces(
  p: { round: number; office: number; uf: string | null; municipality: string | null; t: string | null },
  enabled = true,
) {
  const wsOpen = useWsOpen();
  return useQuery({
    queryKey: qk.locais(p.round, p.office, p.uf, p.municipality, p.t),
    queryFn: ({ signal }) =>
      api<MapPollingPlacesDto>("/maps/polling-places", {
        params: {
          round: p.round,
          office: p.office,
          state_code: p.uf,
          municipality: p.municipality,
          at: p.t,
          limit: 20000,
        },
        signal,
      }),
    enabled,
    ...timeQueryOptions(p.t, wsOpen),
    // no WebSocket topic exists without a municipality: those maps refresh by polling
    ...(!p.municipality && !p.t ? { refetchInterval: 60_000 } : {}),
  });
}

/** Loads a static GeoJSON file; throws when it is missing. */
export async function fetchGeoJson(url: string): Promise<FeatureCollection<Geometry | null, GeoProps>> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao carregar a malha ${url}`);
  return r.json();
}

/** The 27 state outlines. Static files: loaded once and kept. */
export function useStateMesh() {
  return useQuery({
    queryKey: ["geo", "uf"],
    queryFn: async (): Promise<StateMesh> => {
      const collection = await fetchGeoJson("/geo/br-uf.json");
      const features = prepareMesh(collection, (p) => p.uf.toLowerCase());
      return { features, byKey: new Map(features.map((f) => [f.key, f])) };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** The municipality outlines, indexed by IBGE code and grouped by state. Loaded once, on demand. */
export function useMunicipalityMesh(enabled = true) {
  return useQuery({
    queryKey: ["geo", "mun"],
    queryFn: async (): Promise<MunicipalityMesh> => {
      const collection = await fetchGeoJson("/geo/br-mun.json");
      const features = prepareMesh(collection, (p) => String(p.id ?? ""));
      const byState = new Map<string, FeatureGeo[]>();
      for (const f of features) {
        const uf = f.properties.uf.toLowerCase();
        const list = byState.get(uf);
        if (list) list.push(f);
        else byState.set(uf, [f]);
      }
      return { features, byId: new Map(features.map((f) => [f.key, f])), byState };
    },
    staleTime: Infinity,
    gcTime: Infinity,
    enabled,
  });
}
