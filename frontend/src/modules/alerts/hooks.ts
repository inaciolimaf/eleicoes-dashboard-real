import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { AlertCreate, AlertDto, AlertUpdate } from "../../api/models";
import { qk } from "../../api/query-keys";
import { useAuth } from "../../lib/auth-store";

export function useAlerts() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.alertas(),
    queryFn: ({ signal }) => api<AlertDto[]>("/alerts", { signal }),
    enabled: !!token,
  });
}

/** Creates a rule (no id) or updates an existing one. */
export function useSaveAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rule: Partial<AlertDto> & Pick<AlertDto, "type" | "params" | "active">) =>
      rule.id
        ? api<AlertDto>(`/alerts/${rule.id}`, {
            method: "PUT",
            body: { type: rule.type, params: rule.params, active: rule.active } satisfies AlertUpdate,
          })
        : api<AlertDto>("/alerts", {
            method: "POST",
            body: { type: rule.type, params: rule.params, active: rule.active } satisfies AlertCreate,
          }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.alertas() }),
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/alerts/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.alertas() }),
  });
}
