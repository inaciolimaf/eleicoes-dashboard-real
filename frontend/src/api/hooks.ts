import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AdminFake,
  AdminFakeReq,
  AdminSaude,
  Alerta,
  AuthResp,
  BuscaResp,
  CandidatoDetalhe,
  CandidatoLista,
  Eleicao,
  Evento,
  Favorito,
  FilhosResp,
  LinhaDoTempoResp,
  LocaisResp,
  LocalDetalhe,
  Nivel,
  PreferenciasApi,
  ProgressoResp,
  ResultadosResp,
  SecaoDetalhe,
  SerieResp,
  StatusResp,
  Usuario,
} from "./types";
import { useUi } from "../store/ui";
import { useAuth } from "../store/auth";

// ------------------------------------------------------------------ chaves
export const qk = {
  status: () => ["status"] as const,
  eleicoes: () => ["eleicoes"] as const,
  resultados: (turno: number, cargo: number, nivel: Nivel, id: string, t: string | null) =>
    ["resultados", turno, cargo, nivel, id, t] as const,
  serie: (turno: number, cargo: number, nivel: Nivel, id: string, ate: string | null) =>
    ["serie", turno, cargo, nivel, id, ate] as const,
  filhos: (
    turno: number,
    cargo: number,
    nivel: Nivel,
    id: string,
    filhos: Nivel | null,
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
  nivel?: Nivel | null;
  id?: string | null;
  tipos?: string[];
  limite?: number;
}

/** Opções comuns: ao vivo = cache patchado pelo WS + polling de segurança (mais frequente se o WS cair); com t = histórico imutável */
function opcoesTempo(t: string | null, wsAberto: boolean) {
  return t
    ? { staleTime: Infinity, gcTime: 5 * 60_000, placeholderData: keepPreviousData }
    : { staleTime: 20_000, refetchInterval: wsAberto ? 60_000 : 30_000, placeholderData: keepPreviousData };
}

const useWsAberto = () => useUi((s) => s.wsEstado === "aberto");

// ------------------------------------------------------------------ leitura pública
export function useStatus() {
  return useQuery({
    queryKey: qk.status(),
    queryFn: ({ signal }) => api<StatusResp>("/status", { signal }),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useEleicoes() {
  return useQuery({
    queryKey: qk.eleicoes(),
    queryFn: ({ signal }) => api<Eleicao[]>("/eleicoes", { signal }),
    staleTime: 10 * 60_000,
  });
}

export function useResultados(
  p: { turno: number; cargo: number; nivel: Nivel; id: string; t: string | null },
  enabled = true,
) {
  const ws = useWsAberto();
  return useQuery({
    queryKey: qk.resultados(p.turno, p.cargo, p.nivel, p.id, p.t),
    queryFn: ({ signal }) =>
      api<ResultadosResp>("/resultados", {
        params: { turno: p.turno, cargo: p.cargo, nivel: p.nivel, id: p.id, t: p.t },
        signal,
      }),
    enabled: enabled && !!p.id,
    ...opcoesTempo(p.t, ws),
  });
}

export function useSerie(p: { turno: number; cargo: number; nivel: Nivel; id: string; t: string | null }, enabled = true) {
  return useQuery({
    queryKey: qk.serie(p.turno, p.cargo, p.nivel, p.id, p.t),
    queryFn: ({ signal }) =>
      api<SerieResp>("/resultados/serie", {
        params: { turno: p.turno, cargo: p.cargo, nivel: p.nivel, id: p.id, ate: p.t, max_pontos: 300 },
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
    nivel: Nivel;
    id: string;
    t: string | null;
    filhos?: Nivel | null;
    candidatos?: string[];
  },
  enabled = true,
) {
  const ws = useWsAberto();
  const cands = (p.candidatos ?? []).filter(Boolean).join(",");
  return useQuery({
    queryKey: qk.filhos(p.turno, p.cargo, p.nivel, p.id, p.filhos ?? null, cands, p.t),
    queryFn: ({ signal }) =>
      api<FilhosResp>("/recortes/filhos", {
        params: {
          turno: p.turno,
          cargo: p.cargo,
          nivel: p.nivel,
          id: p.id,
          t: p.t,
          filhos: p.filhos ?? undefined,
          candidatos: cands || undefined,
        },
        signal,
      }),
    enabled: enabled && p.nivel !== "secao",
    ...opcoesTempo(p.t, ws),
  });
}

export function useProgresso(turno: number, t: string | null) {
  const ws = useWsAberto();
  return useQuery({
    queryKey: qk.progresso(turno, t),
    queryFn: ({ signal }) => api<ProgressoResp>("/progresso", { params: { turno, t }, signal }),
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
      api<LocaisResp>("/mapas/locais", {
        params: { turno: p.turno, cargo: p.cargo, uf: p.uf, municipio: p.municipio, t: p.t, limite: 20000 },
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
    queryFn: ({ signal }) => api<LocalDetalhe>(`/locais/${encodeURIComponent(id ?? "")}`, { params: { turno }, signal }),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useSecao(id: string | null | undefined, turno: number) {
  return useQuery({
    queryKey: qk.secao(id ?? "", turno),
    queryFn: ({ signal }) => api<SecaoDetalhe>(`/secoes/${encodeURIComponent(id ?? "")}`, { params: { turno }, signal }),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCandidatos(turno: number, cargo: number, uf: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.candidatos(turno, cargo, uf),
    queryFn: ({ signal }) => api<CandidatoLista[]>("/candidatos", { params: { turno, cargo, uf }, signal }),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useCandidato(sq: string | null | undefined, turno: number, t: string | null) {
  return useQuery({
    queryKey: qk.candidato(sq ?? "", turno, t),
    queryFn: ({ signal }) =>
      api<CandidatoDetalhe>(`/candidatos/${encodeURIComponent(sq ?? "")}`, { params: { turno, t }, signal }),
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
      api<Evento[]>("/eventos", {
        params: {
          turno,
          limite: f.limite ?? 100,
          tipos: f.tipos?.length ? f.tipos : undefined,
          cargo: f.cargo ?? undefined,
          nivel: f.nivel ?? undefined,
          id: f.id ?? undefined,
        },
        signal,
      }),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
  // Com T selecionado, mostra só o que já tinha acontecido em T
  const data = t && q.data ? q.data.filter((e) => e.ocorrido_em <= t) : q.data;
  return { ...q, data };
}

export function useLinhaDoTempo(turno: number) {
  return useQuery({
    queryKey: qk.linha(turno),
    queryFn: ({ signal }) => api<LinhaDoTempoResp>("/linha-do-tempo", { params: { turno }, signal }),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function useBusca(q: string) {
  return useQuery({
    queryKey: qk.busca(q),
    queryFn: ({ signal }) => api<BuscaResp>("/busca", { params: { q, limite: 20 }, signal }),
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
    queryFn: ({ signal }) => api<Usuario>("/auth/me", { signal }),
    enabled: !!token,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const setSessao = useAuth((s) => s.setSessao);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { email: string; senha: string }) => api<AuthResp>("/auth/login", { method: "POST", body: b }),
    onSuccess: (r) => {
      setSessao(r.access_token, r.usuario);
      qc.invalidateQueries({ queryKey: qk.paineis() });
    },
  });
}

export function useRegistro() {
  const setSessao = useAuth((s) => s.setSessao);
  return useMutation({
    mutationFn: (b: { email: string; senha: string; nome: string }) =>
      api<AuthResp>("/auth/registro", { method: "POST", body: b }),
    onSuccess: (r) => setSessao(r.access_token, r.usuario),
  });
}

// ------------------------------------------------------------------ favoritos / alertas / prefs
export function useFavoritosApi() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.favoritos(),
    queryFn: ({ signal }) => api<Favorito[]>("/favoritos", { signal }),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useAlertas() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.alertas(),
    queryFn: ({ signal }) => api<Alerta[]>("/alertas", { signal }),
    enabled: !!token,
  });
}

export function useSalvarAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Partial<Alerta> & Pick<Alerta, "tipo" | "params" | "ativo">) =>
      a.id
        ? api<Alerta>(`/alertas/${a.id}`, { method: "PUT", body: { tipo: a.tipo, params: a.params, ativo: a.ativo } })
        : api<Alerta>("/alertas", { method: "POST", body: { tipo: a.tipo, params: a.params, ativo: a.ativo } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.alertas() }),
  });
}

export function useApagarAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/alertas/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.alertas() }),
  });
}

export function usePreferenciasApi() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.preferencias(),
    queryFn: ({ signal }) => api<Partial<PreferenciasApi>>("/preferencias", { signal }),
    enabled: !!token,
    staleTime: Infinity,
    retry: false,
  });
}

// ------------------------------------------------------------------ admin
export function useAdminSaude(enabled: boolean) {
  return useQuery({
    queryKey: qk.adminSaude(),
    queryFn: ({ signal }) => api<AdminSaude>("/admin/saude", { signal }),
    enabled,
    refetchInterval: 5_000,
  });
}

export function useAdminFake(enabled: boolean) {
  return useQuery({
    queryKey: qk.adminFake(),
    queryFn: ({ signal }) => api<AdminFake>("/admin/fake", { signal }),
    enabled,
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useAdminAcao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { tipo: "pausar" | "retomar" } | { tipo: "fake"; body: AdminFakeReq }) =>
      a.tipo === "fake"
        ? api<AdminFake>("/admin/fake", { method: "POST", body: a.body })
        : api<unknown>(`/admin/coletor/${a.tipo}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: qk.status() });
      qc.invalidateQueries({ queryKey: qk.linha(1) });
    },
  });
}

