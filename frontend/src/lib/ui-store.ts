import { persist as persistNav } from "zustand/middleware";
import { create } from "zustand";

interface UiState {
  navbarOpen: boolean;
  tvMode: boolean;
  authOpen: boolean;
  wsStatus: "connecting" | "open" | "reconnecting" | "closed";
  toggleNavbar: () => void;
  setNavbar: (b: boolean) => void;
  setTvMode: (b: boolean) => void;
  setAuthOpen: (b: boolean) => void;
  setWsStatus: (e: UiState["wsStatus"]) => void;
}

export const useUi = create<UiState>()((set) => ({
  navbarOpen: false,
  tvMode: false,
  authOpen: false,
  wsStatus: "connecting",
  toggleNavbar: () => set((s) => ({ navbarOpen: !s.navbarOpen })),
  setNavbar: (navbarOpen) => set({ navbarOpen }),
  setTvMode: (tvMode) => set({ tvMode }),
  setAuthOpen: (authOpen) => set({ authOpen: authOpen }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
}));

interface NavDesktopState {
  aberta: boolean;
  toggle: () => void;
}
export const useDesktopNav = create<NavDesktopState>()(
  persistNav((set) => ({ aberta: true, toggle: () => set((s) => ({ aberta: !s.aberta })) }), {
    name: "eleicoes.nav",
  }),
);
