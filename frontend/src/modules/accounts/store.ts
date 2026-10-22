import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "../../api/client";
import { qk } from "../../api/query-keys";
import { useFavoritesApi } from "./hooks";
import type { FavoriteDto, FavoriteType } from "../../api/models";
import { useAuth } from "../../lib/auth-store";

interface FavLocal {
  favoritos: FavoriteDto[];
  set: (fn: (f: FavoriteDto[]) => FavoriteDto[]) => void;
}

/** Tipos salvos no navegador antes da migração para os nomes da API. */
const TIPO_LEGADO: Record<string, FavoriteType> = {
  candidato: "candidate",
  recorte: "geo_area",
  local: "polling_place",
  secao: "section",
};

const useFavLocal = create<FavLocal>()(
  persist((set) => ({ favoritos: [], set: (fn) => set((s) => ({ favoritos: fn(s.favoritos) })) }), {
    name: "eleicoes.favoritos",
    merge: (salvo, atual) => {
      const lidos =
        (
          salvo as {
            favoritos?: { tipo?: string; type?: string; ref: string; rotulo?: string; label?: string }[];
          }
        ).favoritos ?? [];
      const favoritos = lidos.map((f) => ({
        type: (f.type ?? TIPO_LEGADO[f.tipo ?? ""] ?? f.tipo) as FavoriteType,
        ref: f.ref,
        label: f.label ?? f.rotulo ?? f.ref,
      }));
      return { ...atual, favoritos };
    },
  }),
);

/** Favoritos (barra rápida): backend quando logado, localStorage quando não. */
export function useFavorites() {
  const logado = !!useAuth((s) => s.token);
  const remoto = useFavoritesApi();
  const local = useFavLocal((s) => s.favoritos);
  const setLocal = useFavLocal((s) => s.set);
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (f: FavoriteDto) => api<FavoriteDto>("/favorites", { method: "POST", body: f }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.favoritos() }),
  });
  const del = useMutation({
    mutationFn: (f: { type: FavoriteType; ref: string }) =>
      api<void>(`/favorites/${encodeURIComponent(f.type)}/${encodeURIComponent(f.ref)}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.favoritos() }),
  });
  const lista = useMemo(() => (logado ? (remoto.data ?? []) : local), [logado, remoto.data, local]);
  const eFavorito = useCallback(
    (tipo: FavoriteType, ref: string) => lista.some((f) => f.type === tipo && f.ref === ref),
    [lista],
  );
  const alternar = useCallback(
    (f: FavoriteDto) => {
      const existe = lista.some((x) => x.type === f.type && x.ref === f.ref);
      if (logado) {
        if (existe) del.mutate(f);
        else add.mutate(f);
        return;
      }
      setLocal((l) => (existe ? l.filter((x) => !(x.type === f.type && x.ref === f.ref)) : [...l, f]));
    },
    [lista, logado, add, del, setLocal],
  );
  return { favoritos: lista, eFavorito, alternar };
}
