import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { PollingSectionDto } from "../../api/models";
import { qk } from "../../api/query-keys";

export function useSection(id: string | null | undefined, turno: number) {
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
