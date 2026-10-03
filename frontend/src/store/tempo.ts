import { create } from "zustand";

export const VELOCIDADES = [1, 10, 60, 300] as const;
export type Velocidade = (typeof VELOCIDADES)[number];

interface TempoState {
  /** Instante selecionado (ISO UTC). null = ao vivo. */
  t: string | null;
  tocando: boolean;
  velocidade: Velocidade;
  /** quantidade de novidades recebidas pelo WS enquanto T ≠ agora */
  novidades: number;
  setT: (t: string | null) => void;
  aoVivo: () => void;
  setTocando: (b: boolean) => void;
  setVelocidade: (v: Velocidade) => void;
  incNovidades: () => void;
}

export const useTempo = create<TempoState>()((set) => ({
  t: null,
  tocando: false,
  velocidade: 60,
  novidades: 0,
  setT: (t) => set(t === null ? { t: null, tocando: false, novidades: 0 } : { t }),
  aoVivo: () => set({ t: null, tocando: false, novidades: 0 }),
  setTocando: (tocando) => set({ tocando }),
  setVelocidade: (velocidade) => set({ velocidade }),
  incNovidades: () => set((s) => ({ novidades: s.novidades + 1 })),
}));
