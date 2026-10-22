import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Level } from "../api/models";

/** Filtro global da aplicação (eleição/turno/cargo/recorte). O tempo fica em `tempo.ts`. */
export interface GlobalFilter {
  ciclo: string | null;
  turno: number;
  cargo: number;
  nivel: Level;
  id: string;
  /** nome do recorte (para exibir no chip antes de carregar o breadcrumb) */
  nome?: string;
}

interface FilterState extends GlobalFilter {
  setFiltro: (f: Partial<GlobalFilter>) => void;
  setRecorte: (nivel: Level, id: string, nome?: string) => void;
}

export const DEFAULT_FILTER: GlobalFilter = {
  ciclo: null,
  turno: 1,
  cargo: 1,
  nivel: "country",
  id: "br",
  nome: "Brasil",
};

export const useFilter = create<FilterState>()(
  persist(
    (set) => ({
      ...DEFAULT_FILTER,
      setFiltro: (f) => set(f),
      setRecorte: (nivel, id, nome) => set({ nivel, id, nome }),
    }),
    {
      name: "eleicoes.filtro",
      partialize: (s) => ({
        ciclo: s.ciclo,
        turno: s.turno,
        cargo: s.cargo,
        nivel: s.nivel,
        id: s.id,
        nome: s.nome,
      }),
    },
  ),
);
