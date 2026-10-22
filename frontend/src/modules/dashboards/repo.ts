import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "../../api/client";
import { qk } from "../../api/query-keys";
import type { DashboardCreate, DashboardDto, DashboardUpdate } from "../../api/models";
import { useAuth } from "../../lib/auth-store";
import { SCHEMA_VERSION, migrate, type DashboardConfig } from "./schema";
import { defaultTemplate } from "./templates";

export interface Dashboard {
  id: string;
  nome: string;
  ordem: number;
  padrao: boolean;
  config: DashboardConfig;
  atualizado_em: string;
  remoto: boolean;
}

// --------------------------------------------------------------- local (sem login)
interface LocalState {
  paineis: Dashboard[];
  setPaineis: (fn: (p: Dashboard[]) => Dashboard[]) => void;
}

export const useLocalDashboards = create<LocalState>()(
  persist(
    (set) => ({
      paineis: [],
      setPaineis: (fn) => set((s) => ({ paineis: fn(s.paineis) })),
    }),
    {
      name: "eleicoes.paineis",
      version: SCHEMA_VERSION,
      // painéis salvos no navegador com o vocabulário antigo de níveis: a leitura normaliza
      merge: (salvo, atual) => {
        const lidos = (salvo as Partial<LocalState>).paineis ?? [];
        return { ...atual, paineis: lidos.map((p) => ({ ...p, config: migrate(p.config) ?? p.config })) };
      },
    },
  ),
);

function toDashboard(p: DashboardDto): Dashboard {
  return {
    id: String(p.id),
    nome: p.name,
    ordem: p.position ?? 0,
    padrao: !!p.is_default,
    config: migrate(p.config) ?? defaultTemplate(),
    atualizado_em: p.updated_at ?? "",
    remoto: true,
  };
}

export { toDashboard };

export interface DashboardChange {
  nome?: string;
  config?: DashboardConfig;
  padrao?: boolean;
  ordem?: number;
}

/** Repositório de painéis: backend quando logado, localStorage quando não. */
export function useDashboards() {
  const token = useAuth((s) => s.token);
  const logado = !!token;
  const qc = useQueryClient();
  const locais = useLocalDashboards((s) => s.paineis);
  const setLocais = useLocalDashboards((s) => s.setPaineis);

  const remoto = useQuery({
    queryKey: qk.paineis(),
    queryFn: ({ signal }) => api<DashboardDto[]>("/dashboards", { signal }),
    enabled: logado,
    staleTime: 30_000,
    select: (l) => l.map(toDashboard),
  });

  const lista = useMemo(
    () =>
      [...(logado ? (remoto.data ?? []) : locais)].sort(
        (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome),
      ),
    [logado, remoto.data, locais],
  );

  const mCriar = useMutation({
    mutationFn: (b: { nome: string; config: DashboardConfig; padrao?: boolean }) =>
      api<DashboardDto>("/dashboards", {
        method: "POST",
        body: {
          name: b.nome,
          config: { ...b.config, schemaVersion: SCHEMA_VERSION },
          is_default: b.padrao ?? false,
          schema_version: SCHEMA_VERSION,
        } satisfies DashboardCreate,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.paineis() }),
  });
  const mSalvar = useMutation({
    mutationFn: ({ p, m }: { p: Dashboard; m: DashboardChange }) =>
      api<DashboardDto>(`/dashboards/${p.id}`, {
        method: "PUT",
        body: {
          name: m.nome ?? p.nome,
          config: m.config ?? p.config,
          is_default: m.padrao ?? p.padrao,
          position: m.ordem ?? p.ordem,
          schema_version: SCHEMA_VERSION,
        } satisfies DashboardUpdate,
      }),
    onSuccess: (r) => {
      const novo = toDashboard(r);
      qc.setQueryData<DashboardDto[]>(qk.paineis(), (old) =>
        old?.map((x) => (String(x.id) === novo.id ? r : x)),
      );
    },
  });
  const mApagar = useMutation({
    mutationFn: (id: string) => api<void>(`/dashboards/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.paineis() }),
  });

  const criar = useCallback(
    async (nome: string, config: DashboardConfig, padrao?: boolean): Promise<Dashboard> => {
      const cfg = { ...config, nome, schemaVersion: SCHEMA_VERSION };
      if (logado) {
        const r = await mCriar.mutateAsync({ nome, config: cfg, padrao: padrao ?? lista.length === 0 });
        return toDashboard(r);
      }
      const p: Dashboard = {
        id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        nome,
        ordem: lista.length,
        padrao: padrao ?? lista.length === 0,
        config: cfg,
        atualizado_em: new Date().toISOString(),
        remoto: false,
      };
      setLocais((l) => [...(p.padrao ? l.map((x) => ({ ...x, padrao: false })) : l), p]);
      return p;
    },
    [logado, mCriar, lista.length, setLocais],
  );

  const salvar = useCallback(
    async (id: string, m: DashboardChange) => {
      const p = lista.find((x) => x.id === id);
      if (!p) return;
      if (logado && p.remoto) {
        await mSalvar.mutateAsync({ p, m });
        return;
      }
      setLocais((l) =>
        l.map((x) => (x.id === id ? { ...x, ...m, atualizado_em: new Date().toISOString() } : x)),
      );
    },
    [lista, logado, mSalvar, setLocais],
  );

  const definirPadrao = useCallback(
    async (id: string) => {
      if (logado) {
        for (const p of lista)
          if (p.padrao !== (p.id === id)) await mSalvar.mutateAsync({ p, m: { padrao: p.id === id } });
        return;
      }
      setLocais((l) => l.map((x) => ({ ...x, padrao: x.id === id })));
    },
    [lista, logado, mSalvar, setLocais],
  );

  const apagar = useCallback(
    async (id: string) => {
      if (logado) await mApagar.mutateAsync(id);
      else setLocais((l) => l.filter((x) => x.id !== id));
    },
    [logado, mApagar, setLocais],
  );

  const reordenar = useCallback(
    async (ids: string[]) => {
      if (logado) {
        for (const [i, id] of ids.entries()) {
          const p = lista.find((x) => x.id === id);
          if (p && p.ordem !== i) await mSalvar.mutateAsync({ p, m: { ordem: i } });
        }
        return;
      }
      setLocais((l) => l.map((x) => ({ ...x, ordem: ids.indexOf(x.id) >= 0 ? ids.indexOf(x.id) : x.ordem })));
    },
    [lista, logado, mSalvar, setLocais],
  );

  /** Envia os painéis salvos no navegador para a conta (RF-08: migrar depois) */
  const migrarLocais = useCallback(async () => {
    if (!logado) return 0;
    let n = 0;
    for (const p of useLocalDashboards.getState().paineis) {
      await mCriar.mutateAsync({ nome: p.nome, config: p.config, padrao: false });
      n++;
    }
    setLocais(() => []);
    return n;
  }, [logado, mCriar, setLocais]);

  return {
    paineis: lista,
    logado,
    carregando: logado && remoto.isLoading,
    erro: logado ? remoto.error : null,
    criar,
    salvar,
    apagar,
    definirPadrao,
    reordenar,
    migrarLocais,
    locaisPendentes: logado ? locais.length : 0,
    salvando: mSalvar.isPending || mCriar.isPending,
  };
}
