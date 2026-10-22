import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EventType } from "../api/models";

export type Tema = "escuro" | "claro" | "auto";
export type Densidade = "confortavel" | "compacta";

export interface Preferencias {
  tema: Tema;
  densidade: Densidade;
  animacoes: boolean;
  coresCandidatos: Record<string, string>;
  toasts: (EventType | string)[];
  push: boolean;
  basemap: boolean;
}

interface PrefsState extends Preferencias {
  set: (p: Partial<Preferencias>) => void;
  setCor: (sqcand: string, cor: string | null) => void;
  carregar: (p: Partial<Preferencias>) => void;
}

/** Tipos de evento salvos no navegador com os nomes antigos. */
const TOASTS_LEGADO: Record<string, string> = {
  virada: "lead_change",
  marco: "milestone",
  eleito: "elected",
  segundo_turno: "runoff",
  matematicamente_definido: "mathematically_decided",
  inicio: "start",
  finalizado: "milestone",
};

export const PREFS_PADRAO: Preferencias = {
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
      ...PREFS_PADRAO,
      set: (p) => set(p),
      setCor: (sqcand, cor) =>
        set((s) => {
          const coresCandidatos = { ...s.coresCandidatos };
          if (cor) coresCandidatos[sqcand] = cor;
          else delete coresCandidatos[sqcand];
          return { coresCandidatos };
        }),
      carregar: (p) => set(p),
    }),
    {
      name: "eleicoes.prefs",
      // tipos de evento salvos antes da migração para os nomes da API
      merge: (salvo, atual) => {
        const p = salvo as Partial<Preferencias>;
        const toasts = p.toasts?.map((t) => TOASTS_LEGADO[t] ?? t);
        return { ...atual, ...p, ...(toasts ? { toasts } : {}) };
      },
    },
  ),
);
