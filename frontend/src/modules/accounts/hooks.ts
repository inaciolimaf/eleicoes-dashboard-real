import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type {
  FavoriteDto,
  LoginCreate,
  PreferencesDto,
  RegisterCreate,
  TokenDto,
  UserDto,
} from "../../api/models";
import { useAuth } from "../../lib/auth-store";
import { qk } from "../../api/query-keys";

export function useMe() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.me(),
    queryFn: ({ signal }) => api<UserDto>("/auth/me", { signal }),
    enabled: !!token,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const setSessao = useAuth((s) => s.setSessao);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { email: string; senha: string }) =>
      api<TokenDto>("/auth/login", {
        method: "POST",
        body: { email: b.email, password: b.senha } satisfies LoginCreate,
      }),
    onSuccess: (r) => {
      setSessao(r.access_token, r.user);
      qc.invalidateQueries({ queryKey: qk.paineis() });
    },
  });
}

export function useRegister() {
  const setSessao = useAuth((s) => s.setSessao);
  return useMutation({
    mutationFn: (b: { email: string; senha: string; nome: string }) =>
      api<TokenDto>("/auth/register", {
        method: "POST",
        body: { email: b.email, password: b.senha, name: b.nome } satisfies RegisterCreate,
      }),
    onSuccess: (r) => setSessao(r.access_token, r.user),
  });
}

export function useFavoritesApi() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.favoritos(),
    queryFn: ({ signal }) => api<FavoriteDto[]>("/favorites", { signal }),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function usePreferencesApi() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.preferencias(),
    queryFn: ({ signal }) => api<Partial<PreferencesDto>>("/preferences", { signal }),
    enabled: !!token,
    staleTime: Infinity,
    retry: false,
  });
}
