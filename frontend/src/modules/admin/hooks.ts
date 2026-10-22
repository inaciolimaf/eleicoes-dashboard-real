import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { AdminHealthDto, FakeTseControlCreate, FakeTseStateDto } from "../../api/models";
import { qk } from "../../api/query-keys";

export function useAdminHealth(enabled: boolean) {
  return useQuery({
    queryKey: qk.adminSaude(),
    queryFn: ({ signal }) => api<AdminHealthDto>("/admin/health", { signal }),
    enabled,
    refetchInterval: 5_000,
  });
}

export function useAdminFake(enabled: boolean) {
  return useQuery({
    queryKey: qk.adminFake(),
    queryFn: ({ signal }) => api<FakeTseStateDto>("/admin/fake-tse", { signal }),
    enabled,
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { tipo: "pausar" | "retomar" } | { tipo: "fake"; body: FakeTseControlCreate }) =>
      a.tipo === "fake"
        ? api<FakeTseStateDto>("/admin/fake-tse", { method: "POST", body: a.body })
        : api<unknown>(`/admin/collector/${a.tipo === "pausar" ? "pause" : "resume"}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: qk.status() });
      qc.invalidateQueries({ queryKey: qk.linha(1) });
    },
  });
}
