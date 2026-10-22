import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { EventDto, TimelineDto } from "../../api/models";
import { qk, EventFilter } from "../../api/query-keys";

export function useEventos(turno: number, f: EventFilter, t: string | null) {
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

export function useTimeline(turno: number) {
  return useQuery({
    queryKey: qk.linha(turno),
    queryFn: ({ signal }) => api<TimelineDto>("/timeline", { params: { round: turno }, signal }),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}
