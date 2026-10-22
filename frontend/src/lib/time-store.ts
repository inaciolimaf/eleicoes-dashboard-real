import { create } from "zustand";

export const SPEEDS = [1, 10, 60, 300] as const;
export type Speed = (typeof SPEEDS)[number];

interface TimeState {
  /** Selected instant (ISO UTC). null = live. */
  t: string | null;
  playing: boolean;
  speed: Speed;
  /** updates received over the WebSocket while T is not live */
  updates: number;
  setT: (t: string | null) => void;
  goLive: () => void;
  setPlaying: (b: boolean) => void;
  setSpeed: (v: Speed) => void;
  incUpdates: () => void;
}

export const useTime = create<TimeState>()((set) => ({
  t: null,
  playing: false,
  speed: 60,
  updates: 0,
  setT: (t) => set(t === null ? { t: null, playing: false, updates: 0 } : { t }),
  goLive: () => set({ t: null, playing: false, updates: 0 }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  incUpdates: () => set((s) => ({ updates: s.updates + 1 })),
}));
