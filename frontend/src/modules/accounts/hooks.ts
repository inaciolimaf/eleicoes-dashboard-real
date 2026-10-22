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
import { qk } from "../../api/query-keys";
import { useAuth } from "../../lib/auth-store";

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
  const setSession = useAuth((s) => s.setSessao);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<TokenDto>("/auth/login", {
        method: "POST",
        body: { email: credentials.email, password: credentials.password } satisfies LoginCreate,
      }),
    onSuccess: (token) => {
      setSession(token.access_token, token.user);
      queryClient.invalidateQueries({ queryKey: qk.paineis() });
    },
  });
}

export function useRegister() {
  const setSession = useAuth((s) => s.setSessao);
  return useMutation({
    mutationFn: (credentials: { email: string; password: string; name: string }) =>
      api<TokenDto>("/auth/register", {
        method: "POST",
        body: {
          email: credentials.email,
          password: credentials.password,
          name: credentials.name,
        } satisfies RegisterCreate,
      }),
    onSuccess: (token) => setSession(token.access_token, token.user),
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
