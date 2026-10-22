import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { SearchDto } from "../../api/models";
import { qk } from "../../api/query-keys";

export function useSearch(q: string) {
  return useQuery({
    queryKey: qk.busca(q),
    queryFn: ({ signal }) => api<SearchDto>("/search", { params: { q, limit: 20 }, signal }),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
