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

/** Area selection shared by the result hooks: the round, office, geo area and the time (`null` = now). */
export interface ResultsParams {
  turno: number;
  cargo: number;
  nivel: Level;
  id: string;
  t: string | null;
}

export function useResults(p: ResultsParams, enabled = true) {
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

export interface ChildrenParams extends ResultsParams {
  /** Level of the rows; the API picks the natural one when absent. */
  childLevel?: Level | null;
  /** Candidates whose values are asked for each row. */
  candidates?: string[];
}

export function useChildren(p: ChildrenParams, enabled = true) {
  const ws = useWsOpen();
  const candidateList = (p.candidates ?? []).filter(Boolean).join(",");
  return useQuery({
    queryKey: qk.filhos(p.turno, p.cargo, p.nivel, p.id, p.childLevel ?? null, candidateList, p.t),
    queryFn: ({ signal }) =>
      api<ChildrenDto>("/geo-areas/children", {
        params: {
          round: p.turno,
          office: p.cargo,
          level: p.nivel,
          id: p.id,
          at: p.t,
          child_level: p.childLevel ?? undefined,
          candidates: candidateList || undefined,
        },
        signal,
      }),
    enabled: enabled && p.nivel !== "section",
    ...timeQueryOptions(p.t, ws),
  });
}

export function useCandidates(round: number, office: number, state: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.candidatos(round, office, state),
    queryFn: ({ signal }) =>
      api<CandidateDto[]>("/candidates", { params: { round, office, state_code: state }, signal }),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useCandidate(tseCandidateId: string | null | undefined, round: number, at: string | null) {
  return useQuery({
    queryKey: qk.candidato(tseCandidateId ?? "", round, at),
    queryFn: ({ signal }) =>
      api<CandidateDetailDto>(`/candidates/${encodeURIComponent(tseCandidateId ?? "")}`, {
        params: { round, at },
        signal,
      }),
    enabled: !!tseCandidateId,
    staleTime: at ? Infinity : 20_000,
    refetchInterval: at ? false : 30_000,
    placeholderData: keepPreviousData,
  });
}
