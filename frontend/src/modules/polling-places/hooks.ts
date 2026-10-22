import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { PollingPlaceDto } from "../../api/models";
import { qk } from "../../api/query-keys";

export function usePollingPlace(id: string | null | undefined, turno: number) {
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
