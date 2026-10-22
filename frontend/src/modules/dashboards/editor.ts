import { create } from "zustand";
import type { DashboardConfig } from "./schema";

/** Undo/redo history size. */
const HISTORY_LIMIT = 60;

export interface EditorState {
  dashboardId: string | null;
  config: DashboardConfig | null;
  past: DashboardConfig[];
  future: DashboardConfig[];
  editing: boolean;
  /** Increments on every change that has to be saved. */
  version: number;
  load: (id: string, config: DashboardConfig) => void;
  apply: (
    update: (config: DashboardConfig) => DashboardConfig,
    options?: { history?: boolean; save?: boolean },
  ) => void;
  undo: () => void;
  redo: () => void;
  setEditing: (editing: boolean) => void;
  reset: () => void;
}

/** The dashboard being edited: its config, the undo/redo history and the "needs saving" version. */
export const useEditor = create<EditorState>()((set, get) => ({
  dashboardId: null,
  config: null,
  past: [],
  future: [],
  editing: false,
  version: 0,
  load: (id, config) => {
    const state = get();
    if (state.dashboardId === id && state.config) return;
    set({ dashboardId: id, config, past: [], future: [], editing: false, version: 0 });
  },
  apply: (update, { history = true, save = true } = {}) =>
    set((state) => {
      if (!state.config) return state;
      const next = update(state.config);
      if (next === state.config) return state;
      return {
        config: next,
        past: history ? [...state.past, state.config].slice(-HISTORY_LIMIT) : state.past,
        future: history ? [] : state.future,
        version: save ? state.version + 1 : state.version,
      };
    }),
  undo: () =>
    set((state) => {
      if (!state.config || !state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        config: previous,
        past: state.past.slice(0, -1),
        future: [state.config, ...state.future],
        version: state.version + 1,
      };
    }),
  redo: () =>
    set((state) => {
      if (!state.config || !state.future.length) return state;
      const [next, ...rest] = state.future;
      return { config: next, past: [...state.past, state.config], future: rest, version: state.version + 1 };
    }),
  setEditing: (editing) => set({ editing }),
  reset: () => set({ dashboardId: null, config: null, past: [], future: [], editing: false, version: 0 }),
}));
