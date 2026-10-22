import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { MapPollingPlacesDto } from "../../api/models";
import { qk, timeQueryOptions, useWsOpen } from "../../api/query-keys";
import type { FeatureCollection, Geometry } from "geojson";
import { GeoProps, FeatureGeo, StateMesh, MunicipalityMesh, prepareMesh } from "./lib";

export function useMapPollingPlaces(
  p: { turno: number; cargo: number; uf: string | null; municipio: string | null; t: string | null },
  enabled = true,
) {
  const ws = useWsOpen();
  return useQuery({
    queryKey: qk.locais(p.turno, p.cargo, p.uf, p.municipio, p.t),
    queryFn: ({ signal }) =>
      api<MapPollingPlacesDto>("/maps/polling-places", {
        params: {
          round: p.turno,
          office: p.cargo,
          state_code: p.uf,
          municipality: p.municipio,
          at: p.t,
          limit: 20000,
        },
        signal,
      }),
    enabled,
    ...timeQueryOptions(p.t, ws),
    // sem município não há tópico de WS específico: atualiza por polling
    ...(!p.municipio && !p.t ? { refetchInterval: 60_000 } : {}),
  });
}

export async function fetchGeoJson(url: string): Promise<FeatureCollection<Geometry | null, GeoProps>> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao carregar a malha ${url}`);
  return r.json();
}

export function useStateMesh() {
  return useQuery({
    queryKey: ["geo", "uf"],
    queryFn: async (): Promise<StateMesh> => {
      const fc = await fetchGeoJson("/geo/br-uf.json");
      const features = prepareMesh(fc, (p) => p.uf.toLowerCase());
      return { features, porUf: new Map(features.map((f) => [f.chave, f])) };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useMunicipalityMesh(enabled = true) {
  return useQuery({
    queryKey: ["geo", "mun"],
    queryFn: async (): Promise<MunicipalityMesh> => {
      const fc = await fetchGeoJson("/geo/br-mun.json");
      const features = prepareMesh(fc, (p) => String(p.id ?? ""));
      const porUf = new Map<string, FeatureGeo[]>();
      for (const f of features) {
        const uf = f.properties.uf.toLowerCase();
        const l = porUf.get(uf);
        if (l) l.push(f);
        else porUf.set(uf, [f]);
      }
      return { features, porId: new Map(features.map((f) => [f.chave, f])), porUf };
    },
    staleTime: Infinity,
    gcTime: Infinity,
    enabled,
  });
}
