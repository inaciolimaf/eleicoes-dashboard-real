import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { AlertCreate, AlertDto, AlertUpdate } from "../../api/models";
import { useAuth } from "../../lib/auth-store";
import { qk } from "../../api/query-keys";

export function useAlerts() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.alertas(),
    queryFn: ({ signal }) => api<AlertDto[]>("/alerts", { signal }),
    enabled: !!token,
  });
}

export function useSaveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Partial<AlertDto> & Pick<AlertDto, "type" | "params" | "active">) =>
      a.id
        ? api<AlertDto>(`/alerts/${a.id}`, {
            method: "PUT",
            body: { type: a.type, params: a.params, active: a.active } satisfies AlertUpdate,
          })
        : api<AlertDto>("/alerts", {
            method: "POST",
            body: { type: a.type, params: a.params, active: a.active } satisfies AlertCreate,
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.alertas() }),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/alerts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.alertas() }),
  });
}
