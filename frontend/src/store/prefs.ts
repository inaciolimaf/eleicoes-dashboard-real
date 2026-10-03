import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TipoEvento } from "../api/types";

export type Tema = "escuro" | "claro" | "auto";
export type Densidade = "confortavel" | "compacta";

export interface Preferencias {
  tema: Tema;
  densidade: Densidade;
  animacoes: boolean;
  coresCandidatos: Record<string, string>;
  toasts: (TipoEvento | string)[];
  push: boolean;
  basemap: boolean;
}

interface PrefsState extends Preferencias {
  set: (p: Partial<Preferencias>) => void;
  setCor: (sqcand: string, cor: string | null) => void;
  carregar: (p: Partial<Preferencias>) => void;
}

export const PREFS_PADRAO: Preferencias = {
  tema: "escuro",
  densidade: "confortavel",
  animacoes: true,
  coresCandidatos: {},
  toasts: ["virada", "eleito", "segundo_turno", "matematicamente_definido"],
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
    { name: "eleicoes.prefs" },
  ),
);
