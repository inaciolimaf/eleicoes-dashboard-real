import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { api } from "../../api/client";
import type { AdminHealthDto, FakeTseControlCreate, FakeTseStateDto } from "../../api/models";
import { qk } from "../../api/query-keys";

/** An action of the admin screen: pause or resume the collector, or send a command to the fake TSE clock. */
export type AdminCommand =
  { kind: "pause" } | { kind: "resume" } | { kind: "fake"; body: FakeTseControlCreate };

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

function useAdminMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: AdminCommand) =>
      command.kind === "fake"
        ? api<FakeTseStateDto>("/admin/fake-tse", { method: "POST", body: command.body })
        : api<unknown>(`/admin/collector/${command.kind}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: qk.status() });
      queryClient.invalidateQueries({ queryKey: qk.linha(1) });
    },
  });
}

/** Runs an admin command and tells the user the outcome with a notification. */
export function useRunAdminCommand() {
  const mutation = useAdminMutation();
  return async (command: AdminCommand, successMessage: string) => {
    try {
      await mutation.mutateAsync(command);
      notifications.show({ color: "teal", message: successMessage });
    } catch (error) {
      notifications.show({ color: "red", title: "Falha", message: (error as Error).message });
    }
  };
}
