import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "../../api/client";
import { qk } from "../../api/query-keys";
import type { DashboardCreate, DashboardDto, DashboardUpdate } from "../../api/models";
import { useAuth } from "../../lib/auth-store";
import { SCHEMA_VERSION, type DashboardConfig } from "./schema";
import { toDashboard, useBrowserDashboards, type Dashboard, type DashboardChange } from "./repo";

/**
 * Dashboard repository: the account's dashboards (API) when logged in, the browser's copy
 * (localStorage) when not.
 */
export function useDashboards() {
  const token = useAuth((s) => s.token);
  const isLoggedIn = !!token;
  const browserDashboards = useBrowserDashboards((s) => s.dashboards);
  const setBrowserDashboards = useBrowserDashboards((s) => s.setDashboards);

  const remoteQuery = useQuery({
    queryKey: qk.paineis(),
    queryFn: ({ signal }) => api<DashboardDto[]>("/dashboards", { signal }),
    enabled: isLoggedIn,
    staleTime: 30_000,
    select: (list) => list.map(toDashboard),
  });

  const list = useMemo(
    () =>
      [...(isLoggedIn ? (remoteQuery.data ?? []) : browserDashboards)].sort(
        (a, b) => a.position - b.position || a.name.localeCompare(b.name),
      ),
    [isLoggedIn, remoteQuery.data, browserDashboards],
  );

  const mutations = useDashboardMutations();
  const actions = makeDashboardActions({
    isLoggedIn,
    list,
    mutations,
    setBrowserDashboards,
  });

  return {
    dashboards: list,
    isLoggedIn,
    isLoading: isLoggedIn && remoteQuery.isLoading,
    error: isLoggedIn ? remoteQuery.error : null,
    ...actions,
    pendingLocalCount: isLoggedIn ? browserDashboards.length : 0,
    isSaving: mutations.saveMutation.isPending || mutations.createMutation.isPending,
  };
}

/** Requests to the API that create, change and delete a dashboard of the account. */
function useDashboardMutations() {
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (body: { name: string; config: DashboardConfig; isDefault?: boolean }) =>
      api<DashboardDto>("/dashboards", {
        method: "POST",
        body: {
          name: body.name,
          config: { ...body.config, schemaVersion: SCHEMA_VERSION },
          is_default: body.isDefault ?? false,
          schema_version: SCHEMA_VERSION,
        } satisfies DashboardCreate,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.paineis() }),
  });
  const saveMutation = useMutation({
    mutationFn: ({ dashboard, change }: { dashboard: Dashboard; change: DashboardChange }) =>
      api<DashboardDto>(`/dashboards/${dashboard.id}`, {
        method: "PUT",
        body: {
          name: change.name ?? dashboard.name,
          config: change.config ?? dashboard.config,
          is_default: change.isDefault ?? dashboard.isDefault,
          position: change.position ?? dashboard.position,
          schema_version: SCHEMA_VERSION,
        } satisfies DashboardUpdate,
      }),
    onSuccess: (saved) => {
      const updated = toDashboard(saved);
      queryClient.setQueryData<DashboardDto[]>(qk.paineis(), (old) =>
        old?.map((item) => (String(item.id) === updated.id ? saved : item)),
      );
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/dashboards/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.paineis() }),
  });
  return { createMutation, saveMutation, deleteMutation };
}

type Mutations = ReturnType<typeof useDashboardMutations>;

interface ActionContext {
  isLoggedIn: boolean;
  list: Dashboard[];
  mutations: Mutations;
  setBrowserDashboards: (update: (items: Dashboard[]) => Dashboard[]) => void;
}

/**
 * The operations the screens call. Each one goes to the API when logged in and to the browser's
 * copy otherwise (the "remote" flag marks the dashboards that live in the account).
 */
function makeDashboardActions({ isLoggedIn, list, mutations, setBrowserDashboards }: ActionContext) {
  const { createMutation, saveMutation, deleteMutation } = mutations;

  const create = async (name: string, config: DashboardConfig, isDefault?: boolean): Promise<Dashboard> => {
    const withName = { ...config, nome: name, schemaVersion: SCHEMA_VERSION };
    if (isLoggedIn) {
      const saved = await createMutation.mutateAsync({
        name,
        config: withName,
        isDefault: isDefault ?? list.length === 0,
      });
      return toDashboard(saved);
    }
    const dashboard: Dashboard = {
      id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      name,
      position: list.length,
      isDefault: isDefault ?? list.length === 0,
      config: withName,
      updatedAt: new Date().toISOString(),
      remote: false,
    };
    setBrowserDashboards((items) => [
      ...(dashboard.isDefault ? items.map((x) => ({ ...x, isDefault: false })) : items),
      dashboard,
    ]);
    return dashboard;
  };

  const save = async (id: string, change: DashboardChange) => {
    const dashboard = list.find((x) => x.id === id);
    if (!dashboard) return;
    if (isLoggedIn && dashboard.remote) {
      await saveMutation.mutateAsync({ dashboard, change });
      return;
    }
    setBrowserDashboards((items) =>
      items.map((x) => (x.id === id ? { ...x, ...change, updatedAt: new Date().toISOString() } : x)),
    );
  };

  const setDefault = async (id: string) => {
    if (isLoggedIn) {
      for (const dashboard of list)
        if (dashboard.isDefault !== (dashboard.id === id))
          await saveMutation.mutateAsync({ dashboard, change: { isDefault: dashboard.id === id } });
      return;
    }
    setBrowserDashboards((items) => items.map((x) => ({ ...x, isDefault: x.id === id })));
  };

  const remove = async (id: string) => {
    if (isLoggedIn) await deleteMutation.mutateAsync(id);
    else setBrowserDashboards((items) => items.filter((x) => x.id !== id));
  };

  const reorder = async (ids: string[]) => {
    if (isLoggedIn) {
      for (const [index, id] of ids.entries()) {
        const dashboard = list.find((x) => x.id === id);
        if (dashboard && dashboard.position !== index)
          await saveMutation.mutateAsync({ dashboard, change: { position: index } });
      }
      return;
    }
    setBrowserDashboards((items) =>
      items.map((x) => {
        const index = ids.indexOf(x.id);
        return { ...x, position: index >= 0 ? index : x.position };
      }),
    );
  };

  /** Sends the dashboards saved in the browser to the account (migration after login). */
  const migrateBrowser = async () => {
    if (!isLoggedIn) return 0;
    let count = 0;
    for (const dashboard of useBrowserDashboards.getState().dashboards) {
      await createMutation.mutateAsync({ name: dashboard.name, config: dashboard.config, isDefault: false });
      count++;
    }
    setBrowserDashboards(() => []);
    return count;
  };

  return { create, save, remove, setDefault, reorder, migrateBrowser };
}
