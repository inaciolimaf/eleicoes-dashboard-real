import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Level, ProgressDto, SeriesDto } from "../../api/models";
import { qk, timeQueryOptions, useWsOpen } from "../../api/query-keys";

/** Time series of an area: the points of the candidates' shares over time, and the events. */
export function useSeries(
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

/** Tally progress of every state for a round, at a time (`null` = now). */
export function useProgress(round: number, at: string | null) {
  const ws = useWsOpen();
  return useQuery({
    queryKey: qk.progresso(round, at),
    queryFn: ({ signal }) => api<ProgressDto>("/progress", { params: { round, at }, signal }),
    ...timeQueryOptions(at, ws),
  });
}
