import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { EventDto, TimelineDto } from "../../api/models";
import { qk, type EventFilter } from "../../api/query-keys";

/** Events of a round, newest first. With a selected time T only what had happened by T is shown. */
export function useEvents(round: number, filter: EventFilter, t: string | null) {
  const query = useQuery({
    queryKey: qk.eventos(round, filter),
    queryFn: ({ signal }) =>
      api<EventDto[]>("/events", {
        params: {
          round,
          limit: filter.limit ?? 100,
          types: filter.types?.length ? filter.types : undefined,
          office: filter.office ?? undefined,
          level: filter.level ?? undefined,
          geo_area_id: filter.id ?? undefined,
        },
        signal,
      }),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
  const data =
    t && query.data ? query.data.filter((e) => e.occurred_at !== null && e.occurred_at <= t) : query.data;
  return { ...query, data };
}

/** Timeline of the country and the states (the markers of the time slider). */
export function useTimeline(round: number) {
  return useQuery({
    queryKey: qk.linha(round),
    queryFn: ({ signal }) => api<TimelineDto>("/timeline", { params: { round }, signal }),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}
