import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api } from "../../api/client";
import type { EventDto, SearchDto, TimelineDto } from "../../api/models";
import { qk } from "../../api/query-keys";
import { useTime } from "../../lib/time-store";

const REPLAY_STEP_MS = 2000;
/** Query families that hold live numbers; they are refetched when the view returns to live. */
const LIVE_QUERY_FAMILIES = ["resultados", "filhos", "locais", "progresso"];

export function useSearch(text: string) {
  return useQuery({
    queryKey: qk.busca(text),
    queryFn: ({ signal }) => api<SearchDto>("/search", { params: { q: text, limit: 20 }, signal }),
    enabled: text.trim().length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Goes back to the live view and refetches the live numbers: diffs were not applied while the view was in the past. */
export function useBackToLive(): () => void {
  const queryClient = useQueryClient();
  const goLive = useTime((s) => s.aoVivo);
  return () => {
    goLive();
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return LIVE_QUERY_FAMILIES.includes(String(key[0])) && key[key.length - 1] === null;
      },
    });
  };
}

/** Advances the replay clock by the chosen speed every 2 seconds, and returns to live at the end. */
export function useReplayClock(
  playing: boolean,
  start: number | null,
  end: number | null,
  backToLive: () => void,
) {
  useEffect(() => {
    if (!playing || !start || !end) return;
    const id = setInterval(() => {
      const current = useTime.getState().t;
      const base = current ? new Date(current).getTime() : start;
      const next = base + useTime.getState().velocidade * REPLAY_STEP_MS;
      if (next >= end) {
        backToLive();
        return;
      }
      useTime.getState().setT(new Date(Math.floor(next / 1000) * 1000).toISOString());
    }, REPLAY_STEP_MS);
    return () => clearInterval(id);
    // backToLive is rebuilt on every render but only calls stable store actions and the query client
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, start, end]);
}

export interface TimelineEventAt {
  event: EventDto;
  ms: number;
}

/** Events of the timeline that fall inside the window, in time order. */
export function useTimelineEvents(
  timeline: TimelineDto | undefined,
  start: number | null,
  end: number | null,
): TimelineEventAt[] {
  return useMemo(() => {
    if (!timeline || !start || !end || end <= start) return [];
    return timeline.events
      .map((event) => ({ event, ms: new Date(event.occurred_at ?? "").getTime() }))
      .filter((item) => item.ms >= start && item.ms <= end)
      .sort((a, b) => a.ms - b.ms);
  }, [timeline, start, end]);
}

/** The event before (-1) or after (+1) the given instant, with a 1-second tolerance. */
export function findAdjacentEvent(events: TimelineEventAt[], ref: number, direction: 1 | -1) {
  if (direction === 1) return events.find((item) => item.ms > ref + 1000);
  return [...events].reverse().find((item) => item.ms < ref - 1000);
}
