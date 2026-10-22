import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AdminHealthDto,
  AlertCreate,
  AlertDto,
  AlertUpdate,
  CandidateDetailDto,
  CandidateDto,
  ChildrenDto,
  ElectionDto,
  EventDto,
  EventType,
  FakeTseControlCreate,
  FakeTseStateDto,
  FavoriteDto,
  Level,
  LoginCreate,
  MapPollingPlacesDto,
  PollingPlaceDto,
  PollingSectionDto,
  PreferencesDto,
  ProgressDto,
  RegisterCreate,
  ResultsDto,
  SearchDto,
  SeriesDto,
  StatusDto,
  TimelineDto,
  TokenDto,
  UserDto,
} from "./models";
import { useUi } from "../store/ui";
import { useAuth } from "../store/auth";

// ------------------------------------------------------------------ chaves
export const qk = {
  status: () => ["status"] as const,
  eleicoes: () => ["eleicoes"] as const,
  resultados: (turno: number, cargo: number, nivel: Level, id: string, t: string | null) =>
    ["resultados", turno, cargo, nivel, id, t] as const,
  serie: (turno: number, cargo: number, nivel: Level, id: string, ate: string | null) =>
    ["serie", turno, cargo, nivel, id, ate] as const,
  filhos: (
    turno: number,
    cargo: number,
    nivel: Level,
    id: string,
    filhos: Level | null,
    candidatos: string,
    t: string | null,
  ) => ["filhos", turno, cargo, nivel, id, filhos, candidatos, t] as const,
  progresso: (turno: number, t: string | null) => ["progresso", turno, t] as const,
  locais: (turno: number, cargo: number, uf: string | null, municipio: string | null, t: string | null) =>
    ["locais", turno, cargo, uf, municipio, t] as const,
  local: (id: string, turno: number) => ["local", id, turno] as const,
  secao: (id: string, turno: number) => ["secao", id, turno] as const,
  candidatos: (turno: number, cargo: number, uf: string | null) => ["candidatos", turno, cargo, uf] as const,
  candidato: (sq: string, turno: number, t: string | null) => ["candidato", sq, turno, t] as const,
  eventos: (turno: number, f: EventosFiltro) => ["eventos", turno, f] as const,
  linha: (turno: number) => ["linha", turno] as const,
  busca: (q: string) => ["busca", q] as const,
  me: () => ["me"] as const,
  paineis: () => ["paineis"] as const,
  favoritos: () => ["favoritos"] as const,
  alertas: () => ["alertas"] as const,
  preferencias: () => ["preferencias"] as const,
  adminSaude: () => ["admin", "saude"] as const,
  adminFake: () => ["admin", "fake"] as const,
};

export interface EventosFiltro {
  cargo?: number | null;
  nivel?: Level | null;
  id?: string | null;
  tipos?: EventType[];
  limite?: number;
}

/** Opções comuns: ao vivo = cache patchado pelo WS + polling de segurança (mais frequente se o WS cair); com t = histórico imutável */
function opcoesTempo(t: string | null, wsAberto: boolean) {
  return t
    ? { staleTime: Infinity, gcTime: 5 * 60_000, placeholderData: keepPreviousData }
    : {
        staleTime: 20_000,
        refetchInterval: wsAberto ? 60_000 : 30_000,
        placeholderData: keepPreviousData,
      };
}

const useWsAberto = () => useUi((s) => s.wsEstado === "aberto");

// ------------------------------------------------------------------ leitura pública
export function useStatus() {
  return useQuery({
    queryKey: qk.status(),
    queryFn: ({ signal }) => api<StatusDto>("/status", { signal }),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useEleicoes() {
  return useQuery({
    queryKey: qk.eleicoes(),
    queryFn: ({ signal }) => api<ElectionDto[]>("/elections", { signal }),
    staleTime: 10 * 60_000,
  });
}

export function useResultados(
  p: { turno: number; cargo: number; nivel: Level; id: string; t: string | null },
  enabled = true,
) {
  const ws = useWsAberto();
  return useQuery({
    queryKey: qk.resultados(p.turno, p.cargo, p.nivel, p.id, p.t),
    queryFn: ({ signal }) =>
      api<ResultsDto>("/results", {
        params: { round: p.turno, office: p.cargo, level: p.nivel, id: p.id, at: p.t },
        signal,
      }),
    enabled: enabled && !!p.id,
    ...opcoesTempo(p.t, ws),
  });
}

export function useSerie(
  p: { turno: number; cargo: number; nivel: Level; id: string; t: string | null },
  enabled = true,
) {
  return useQuery({
    queryKey: qk.serie(p.turno, p.cargo, p.nivel, p.id, p.t),
    queryFn: ({ signal }) =>
      api<SeriesDto>("/results/series", {
        params: {
          round: p.turno,
          office: p.cargo,
          level: p.nivel,
          id: p.id,
          to: p.t,
          max_points: 300,
        },
        signal,
      }),
    enabled,
    staleTime: p.t ? Infinity : 30_000,
    refetchInterval: p.t ? false : 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useFilhos(
  p: {
    turno: number;
    cargo: number;
    nivel: Level;
    id: string;
    t: string | null;
    filhos?: Level | null;
    candidatos?: string[];
  },
  enabled = true,
) {
  const ws = useWsAberto();
  const cands = (p.candidatos ?? []).filter(Boolean).join(",");
  return useQuery({
    queryKey: qk.filhos(p.turno, p.cargo, p.nivel, p.id, p.filhos ?? null, cands, p.t),
    queryFn: ({ signal }) =>
      api<ChildrenDto>("/geo-areas/children", {
        params: {
          round: p.turno,
          office: p.cargo,
          level: p.nivel,
          id: p.id,
          at: p.t,
          child_level: p.filhos ?? undefined,
          candidates: cands || undefined,
        },
        signal,
      }),
    enabled: enabled && p.nivel !== "section",
    ...opcoesTempo(p.t, ws),
  });
}

export function useProgresso(turno: number, t: string | null) {
  const ws = useWsAberto();
  return useQuery({
    queryKey: qk.progresso(turno, t),
    queryFn: ({ signal }) => api<ProgressDto>("/progress", { params: { round: turno, at: t }, signal }),
    ...opcoesTempo(t, ws),
  });
}

export function useLocaisMapa(
  p: { turno: number; cargo: number; uf: string | null; municipio: string | null; t: string | null },
  enabled = true,
) {
  const ws = useWsAberto();
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
    ...opcoesTempo(p.t, ws),
    // sem município não há tópico de WS específico: atualiza por polling
    ...(!p.municipio && !p.t ? { refetchInterval: 60_000 } : {}),
  });
}

export function useLocal(id: string | null | undefined, turno: number) {
  return useQuery({
    queryKey: qk.local(id ?? "", turno),
    queryFn: ({ signal }) =>
      api<PollingPlaceDto>(`/polling-places/${encodeURIComponent(id ?? "")}`, {
        params: { round: turno },
        signal,
      }),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useSecao(id: string | null | undefined, turno: number) {
  return useQuery({
    queryKey: qk.secao(id ?? "", turno),
    queryFn: ({ signal }) =>
      api<PollingSectionDto>(`/polling-sections/${encodeURIComponent(id ?? "")}`, {
        params: { round: turno },
        signal,
      }),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCandidatos(turno: number, cargo: number, uf: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.candidatos(turno, cargo, uf),
    queryFn: ({ signal }) =>
      api<CandidateDto[]>("/candidates", { params: { round: turno, office: cargo, state_code: uf }, signal }),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useCandidato(sq: string | null | undefined, turno: number, t: string | null) {
  return useQuery({
    queryKey: qk.candidato(sq ?? "", turno, t),
    queryFn: ({ signal }) =>
      api<CandidateDetailDto>(`/candidates/${encodeURIComponent(sq ?? "")}`, {
        params: { round: turno, at: t },
        signal,
      }),
    enabled: !!sq,
    staleTime: t ? Infinity : 20_000,
    refetchInterval: t ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useEventos(turno: number, f: EventosFiltro, t: string | null) {
  const q = useQuery({
    queryKey: qk.eventos(turno, f),
    queryFn: ({ signal }) =>
      api<EventDto[]>("/events", {
        params: {
          round: turno,
          limit: f.limite ?? 100,
          types: f.tipos?.length ? f.tipos : undefined,
          office: f.cargo ?? undefined,
          level: f.nivel ?? undefined,
          geo_area_id: f.id ?? undefined,
        },
        signal,
      }),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
  // Com T selecionado, mostra só o que já tinha acontecido em T
  const data = t && q.data ? q.data.filter((e) => e.occurred_at !== null && e.occurred_at <= t) : q.data;
  return { ...q, data };
}

export function useLinhaDoTempo(turno: number) {
  return useQuery({
    queryKey: qk.linha(turno),
    queryFn: ({ signal }) => api<TimelineDto>("/timeline", { params: { round: turno }, signal }),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function useBusca(q: string) {
  return useQuery({
    queryKey: qk.busca(q),
    queryFn: ({ signal }) => api<SearchDto>("/search", { params: { q, limit: 20 }, signal }),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

// ------------------------------------------------------------------ auth
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

export function useRegistro() {
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

// ------------------------------------------------------------------ favoritos / alertas / prefs
export function useFavoritosApi() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.favoritos(),
    queryFn: ({ signal }) => api<FavoriteDto[]>("/favorites", { signal }),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useAlertas() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.alertas(),
    queryFn: ({ signal }) => api<AlertDto[]>("/alerts", { signal }),
    enabled: !!token,
  });
}

export function useSalvarAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Partial<AlertDto> & Pick<AlertDto, "type" | "params" | "active">) =>
      a.id
        ? api<AlertDto>(`/alerts/${a.id}`, {
            method: "PUT",
            body: { type: a.type, params: a.params, active: a.active } satisfies AlertUpdate,
          })
        : api<AlertDto>("/alerts", {
            method: "POST",
            body: { type: a.type, params: a.params, active: a.active } satisfies AlertCreate,
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.alertas() }),
  });
}

export function useApagarAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/alerts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.alertas() }),
  });
}

export function usePreferenciasApi() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.preferencias(),
    queryFn: ({ signal }) => api<Partial<PreferencesDto>>("/preferences", { signal }),
    enabled: !!token,
    staleTime: Infinity,
    retry: false,
  });
}

// ------------------------------------------------------------------ admin
export function useAdminSaude(enabled: boolean) {
  return useQuery({
    queryKey: qk.adminSaude(),
    queryFn: ({ signal }) => api<AdminHealthDto>("/admin/health", { signal }),
    enabled,
    refetchInterval: 5_000,
  });
}

export function useAdminFake(enabled: boolean) {
  return useQuery({
    queryKey: qk.adminFake(),
    queryFn: ({ signal }) => api<FakeTseStateDto>("/admin/fake-tse", { signal }),
    enabled,
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useAdminAcao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { tipo: "pausar" | "retomar" } | { tipo: "fake"; body: FakeTseControlCreate }) =>
      a.tipo === "fake"
        ? api<FakeTseStateDto>("/admin/fake-tse", { method: "POST", body: a.body })
        : api<unknown>(`/admin/collector/${a.tipo === "pausar" ? "pause" : "resume"}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: qk.status() });
      qc.invalidateQueries({ queryKey: qk.linha(1) });
    },
  });
}
