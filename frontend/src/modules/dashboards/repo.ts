import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { DashboardDto } from "../../api/models";
import { SCHEMA_VERSION, migrate, type DashboardConfig } from "./schema";
import { defaultTemplate } from "./templates";

/** A dashboard as the screens use it. The account copy comes from the API, the local copy from `localStorage`. */
export interface Dashboard {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
  config: DashboardConfig;
  updatedAt: string;
  remote: boolean;
}

export interface DashboardChange {
  name?: string;
  config?: DashboardConfig;
  isDefault?: boolean;
  position?: number;
}

export function toDashboard(dto: DashboardDto): Dashboard {
  return {
    id: String(dto.id),
    name: dto.name,
    position: dto.position ?? 0,
    isDefault: !!dto.is_default,
    config: migrate(dto.config) ?? defaultTemplate(),
    updatedAt: dto.updated_at ?? "",
    remote: true,
  };
}

// --------------------------------------------------------------- local (no login)

const STORAGE_KEY = "eleicoes.paineis";

/** Dashboard as it is saved in `localStorage`: the keys stay in Portuguese (saved user data). */
interface StoredDashboard {
  id: string;
  nome: string;
  ordem: number;
  padrao: boolean;
  config: DashboardConfig;
  atualizado_em: string;
  remoto: boolean;
}

function toStored(dashboard: Dashboard): StoredDashboard {
  return {
    id: dashboard.id,
    nome: dashboard.name,
    ordem: dashboard.position,
    padrao: dashboard.isDefault,
    config: dashboard.config,
    atualizado_em: dashboard.updatedAt,
    remoto: dashboard.remote,
  };
}

function fromStored(stored: StoredDashboard): Dashboard {
  return {
    id: stored.id,
    name: stored.nome,
    position: stored.ordem,
    isDefault: stored.padrao,
    config: stored.config,
    updatedAt: stored.atualizado_em,
    remote: stored.remoto,
  };
}

/**
 * Translates between the in-memory state and the stored JSON (`{state: {paineis}, version}`),
 * so the English state fields do not change what the browser already holds.
 */
const storedFormat: StateStorage = {
  getItem: (name) => {
    const raw = localStorage.getItem(name);
    if (raw === null) return null;
    const saved = JSON.parse(raw) as { state?: { paineis?: StoredDashboard[] }; version?: number };
    return JSON.stringify({
      state: { dashboards: (saved.state?.paineis ?? []).map(fromStored) },
      version: saved.version,
    });
  },
  setItem: (name, value) => {
    const saved = JSON.parse(value) as { state: { dashboards: Dashboard[] }; version: number };
    localStorage.setItem(
      name,
      JSON.stringify({ state: { paineis: saved.state.dashboards.map(toStored) }, version: saved.version }),
    );
  },
  removeItem: (name) => localStorage.removeItem(name),
};

interface LocalDashboardsState {
  dashboards: Dashboard[];
  setDashboards: (update: (list: Dashboard[]) => Dashboard[]) => void;
}

export const useLocalDashboards = create<LocalDashboardsState>()(
  persist(
    (set) => ({
      dashboards: [],
      setDashboards: (update) => set((state) => ({ dashboards: update(state.dashboards) })),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => storedFormat),
      // dashboards saved in the browser with the old level vocabulary: reading normalizes them
      merge: (saved, current) => {
        const read = (saved as Partial<LocalDashboardsState>).dashboards ?? [];
        return {
          ...current,
          dashboards: read.map((d) => ({ ...d, config: migrate(d.config) ?? d.config })),
        };
      },
    },
  ),
);
