import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EventType } from "../api/models";

export type Theme = "escuro" | "claro" | "auto";
export type Density = "confortavel" | "compacta";

export interface Preferences {
  tema: Theme;
  densidade: Density;
  animacoes: boolean;
  coresCandidatos: Record<string, string>;
  toasts: (EventType | string)[];
  push: boolean;
  basemap: boolean;
}

interface PrefsState extends Preferences {
  set: (p: Partial<Preferences>) => void;
  setCor: (sqcand: string, cor: string | null) => void;
  carregar: (p: Partial<Preferences>) => void;
}

/** Event types saved in the browser under the old (Portuguese) names. */
const TOASTS_LEGADO: Record<string, string> = {
  virada: "lead_change",
  marco: "milestone",
  eleito: "elected",
  segundo_turno: "runoff",
  matematicamente_definido: "mathematically_decided",
  inicio: "start",
  finalizado: "milestone",
};

export const DEFAULT_PREFS: Preferences = {
  tema: "escuro",
  densidade: "confortavel",
  animacoes: true,
  coresCandidatos: {},
  toasts: ["lead_change", "elected", "runoff", "mathematically_decided"],
  push: false,
  basemap: true,
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      set: (p) => set(p),
      setCor: (sqcand, cor) =>
        set((s) => {
          const candidateColors = { ...s.coresCandidatos };
          if (cor) candidateColors[sqcand] = cor;
          else delete candidateColors[sqcand];
          return { coresCandidatos: candidateColors };
        }),
      carregar: (p) => set(p),
    }),
    {
      name: "eleicoes.prefs",
      // event types saved before the migration to the API names
      merge: (salvo, atual) => {
        const p = salvo as Partial<Preferences>;
        const toasts = p.toasts?.map((t) => TOASTS_LEGADO[t] ?? t);
        return { ...atual, ...p, ...(toasts ? { toasts } : {}) };
      },
    },
  ),
);
