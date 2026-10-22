import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type {
  CandidateDetailDto,
  CandidateDto,
  ChildrenDto,
  ElectionDto,
  Level,
  ResultsDto,
  StatusDto,
} from "../../api/models";
import { qk, timeQueryOptions, useWsOpen } from "../../api/query-keys";

export function useStatus() {
  return useQuery({
    queryKey: qk.status(),
    queryFn: ({ signal }) => api<StatusDto>("/status", { signal }),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useElections() {
  return useQuery({
    queryKey: qk.eleicoes(),
    queryFn: ({ signal }) => api<ElectionDto[]>("/elections", { signal }),
    staleTime: 10 * 60_000,
  });
}

export function useResults(
  p: { turno: number; cargo: number; nivel: Level; id: string; t: string | null },
  enabled = true,
) {
  const ws = useWsOpen();
  return useQuery({
    queryKey: qk.resultados(p.turno, p.cargo, p.nivel, p.id, p.t),
    queryFn: ({ signal }) =>
      api<ResultsDto>("/results", {
        params: { round: p.turno, office: p.cargo, level: p.nivel, id: p.id, at: p.t },
        signal,
      }),
    enabled: enabled && !!p.id,
    ...timeQueryOptions(p.t, ws),
  });
}

export function useChildren(
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
  const ws = useWsOpen();
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
    ...timeQueryOptions(p.t, ws),
  });
}

export function useCandidates(turno: number, cargo: number, uf: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.candidatos(turno, cargo, uf),
    queryFn: ({ signal }) =>
      api<CandidateDto[]>("/candidates", { params: { round: turno, office: cargo, state_code: uf }, signal }),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useCandidate(sq: string | null | undefined, turno: number, t: string | null) {
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
