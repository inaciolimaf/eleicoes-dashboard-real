import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { PollingSectionDto } from "../../api/models";
import { qk } from "../../api/query-keys";

/** A polling section (its ballot results per office), for one round. */
export function useSection(id: string | null | undefined, round: number) {
  return useQuery({
    queryKey: qk.secao(id ?? "", round),
    queryFn: ({ signal }) =>
      api<PollingSectionDto>(`/polling-sections/${encodeURIComponent(id ?? "")}`, {
        params: { round },
        signal,
      }),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
