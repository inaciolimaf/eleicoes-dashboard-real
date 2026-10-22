import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "../../api/client";
import { qk } from "../../api/query-keys";
import type { FavoriteDto, FavoriteType } from "../../api/models";
import { useAuth } from "../../lib/auth-store";
import { useFavoritesApi } from "./hooks";

/** Favorite types saved in the browser before the names of the API were adopted. */
const LEGACY_TYPES: Record<string, FavoriteType> = {
  candidato: "candidate",
  recorte: "geo_area",
  local: "polling_place",
  secao: "section",
};

/** A favorite as an older version of the browser saved it (`tipo`, `rotulo` keys). */
interface SavedFavorite {
  tipo?: string;
  type?: string;
  ref: string;
  rotulo?: string;
  label?: string;
}

interface LocalFavoritesState {
  favorites: FavoriteDto[];
  setFavorites: (update: (current: FavoriteDto[]) => FavoriteDto[]) => void;
}

/**
 * Favorites of a visitor without an account. The storage key and its `favoritos` field keep the
 * names already written in browsers, so the saved data stays readable.
 */
export const useLocalFavorites = create<LocalFavoritesState>()(
  persist<LocalFavoritesState, [], [], { favoritos: FavoriteDto[] }>(
    (set) => ({
      favorites: [],
      setFavorites: (update) => set((state) => ({ favorites: update(state.favorites) })),
    }),
    {
      name: "eleicoes.favoritos",
      partialize: (state) => ({ favoritos: state.favorites }),
      merge: (saved, current) => {
        const read = (saved as { favoritos?: SavedFavorite[] }).favoritos ?? [];
        const favorites = read.map((item) => ({
          type: (item.type ?? LEGACY_TYPES[item.tipo ?? ""] ?? item.tipo) as FavoriteType,
          ref: item.ref,
          label: item.label ?? item.rotulo ?? item.ref,
        }));
        return { ...current, favorites };
      },
    },
  ),
);

/**
 * Favorites of the quick bar: the account's when logged in, the browser's otherwise.
 * `favorites`, `isFavorite` and `toggle` are the names the screens use; they stay until
 * those screens are renamed.
 */
export function useFavorites() {
  const loggedIn = !!useAuth((s) => s.token);
  const remote = useFavoritesApi();
  const local = useLocalFavorites((s) => s.favorites);
  const setLocal = useLocalFavorites((s) => s.setFavorites);
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: (favorite: FavoriteDto) => api<FavoriteDto>("/favorites", { method: "POST", body: favorite }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.favoritos() }),
  });
  const remove = useMutation({
    mutationFn: (favorite: { type: FavoriteType; ref: string }) =>
      api<void>(`/favorites/${encodeURIComponent(favorite.type)}/${encodeURIComponent(favorite.ref)}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.favoritos() }),
  });
  const list = useMemo(() => (loggedIn ? (remote.data ?? []) : local), [loggedIn, remote.data, local]);
  const isFavorite = useCallback(
    (type: FavoriteType, ref: string) => list.some((f) => f.type === type && f.ref === ref),
    [list],
  );
  const toggle = useCallback(
    (favorite: FavoriteDto) => {
      const exists = list.some((x) => x.type === favorite.type && x.ref === favorite.ref);
      if (loggedIn) {
        if (exists) remove.mutate(favorite);
        else add.mutate(favorite);
        return;
      }
      setLocal((current) =>
        exists
          ? current.filter((x) => !(x.type === favorite.type && x.ref === favorite.ref))
          : [...current, favorite],
      );
    },
    [list, loggedIn, add, remove, setLocal],
  );
  return { favorites: list, isFavorite, toggle };
}
