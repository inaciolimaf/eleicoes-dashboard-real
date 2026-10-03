import { create } from "zustand";
import type { ConfigPainel } from "./schema";

const LIMITE_HISTORICO = 60;

interface EditorState {
  painelId: string | null;
  config: ConfigPainel | null;
  passado: ConfigPainel[];
  futuro: ConfigPainel[];
  editando: boolean;
  /** incrementa a cada mudança que precisa ser salva */
  versao: number;
  carregar: (id: string, config: ConfigPainel) => void;
  aplicar: (fn: (c: ConfigPainel) => ConfigPainel, opts?: { historico?: boolean; salvar?: boolean }) => void;
  desfazer: () => void;
  refazer: () => void;
  setEditando: (b: boolean) => void;
  limpar: () => void;
}

export const useEditor = create<EditorState>()((set, get) => ({
  painelId: null,
  config: null,
  passado: [],
  futuro: [],
  editando: false,
  versao: 0,
  carregar: (id, config) => {
    const s = get();
    if (s.painelId === id && s.config) return;
    set({ painelId: id, config, passado: [], futuro: [], editando: false, versao: 0 });
  },
  aplicar: (fn, { historico = true, salvar = true } = {}) =>
    set((s) => {
      if (!s.config) return s;
      const novo = fn(s.config);
      if (novo === s.config) return s;
      return {
        config: novo,
        passado: historico ? [...s.passado, s.config].slice(-LIMITE_HISTORICO) : s.passado,
        futuro: historico ? [] : s.futuro,
        versao: salvar ? s.versao + 1 : s.versao,
      };
    }),
  desfazer: () =>
    set((s) => {
      if (!s.config || !s.passado.length) return s;
      const ant = s.passado[s.passado.length - 1];
      return { config: ant, passado: s.passado.slice(0, -1), futuro: [s.config, ...s.futuro], versao: s.versao + 1 };
    }),
  refazer: () =>
    set((s) => {
      if (!s.config || !s.futuro.length) return s;
      const [prox, ...resto] = s.futuro;
      return { config: prox, passado: [...s.passado, s.config], futuro: resto, versao: s.versao + 1 };
    }),
  setEditando: (editando) => set({ editando }),
  limpar: () => set({ painelId: null, config: null, passado: [], futuro: [], editando: false, versao: 0 }),
}));
