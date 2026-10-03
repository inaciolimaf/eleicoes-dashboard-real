import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "../api/client";
import { qk, useFavoritosApi } from "../api/hooks";
import type { Favorito, TipoFavorito } from "../api/types";
import { useAuth } from "./auth";

interface FavLocal {
  favoritos: Favorito[];
  set: (fn: (f: Favorito[]) => Favorito[]) => void;
}

const useFavLocal = create<FavLocal>()(
  persist((set) => ({ favoritos: [], set: (fn) => set((s) => ({ favoritos: fn(s.favoritos) })) }), { name: "eleicoes.favoritos" }),
);

/** Favoritos (barra rápida): backend quando logado, localStorage quando não. */
export function useFavoritos() {
  const logado = !!useAuth((s) => s.token);
  const remoto = useFavoritosApi();
  const local = useFavLocal((s) => s.favoritos);
  const setLocal = useFavLocal((s) => s.set);
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (f: Favorito) => api<Favorito>("/favoritos", { method: "POST", body: f }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.favoritos() }),
  });
  const del = useMutation({
    mutationFn: (f: { tipo: TipoFavorito; ref: string }) =>
      api<void>(`/favoritos/${encodeURIComponent(f.tipo)}/${encodeURIComponent(f.ref)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.favoritos() }),
  });
  const lista = useMemo(() => (logado ? remoto.data ?? [] : local), [logado, remoto.data, local]);
  const eFavorito = useCallback((tipo: TipoFavorito, ref: string) => lista.some((f) => f.tipo === tipo && f.ref === ref), [lista]);
  const alternar = useCallback(
    (f: Favorito) => {
      const existe = lista.some((x) => x.tipo === f.tipo && x.ref === f.ref);
      if (logado) {
        if (existe) del.mutate(f);
        else add.mutate(f);
        return;
      }
      setLocal((l) => (existe ? l.filter((x) => !(x.tipo === f.tipo && x.ref === f.ref)) : [...l, f]));
    },
    [lista, logado, add, del, setLocal],
  );
  return { favoritos: lista, eFavorito, alternar };
}
