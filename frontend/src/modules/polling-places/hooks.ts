import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { PollingPlaceDto } from "../../api/models";
import { qk } from "../../api/query-keys";

/** A polling place with its sections, for one round. */
export function usePollingPlace(id: string | null | undefined, round: number) {
  return useQuery({
    queryKey: qk.local(id ?? "", round),
    queryFn: ({ signal }) =>
      api<PollingPlaceDto>(`/polling-places/${encodeURIComponent(id ?? "")}`, {
        params: { round },
        signal,
      }),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
