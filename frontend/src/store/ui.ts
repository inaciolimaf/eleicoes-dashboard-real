import { persist as persistNav } from "zustand/middleware";
import { create } from "zustand";

interface UiState {
  navbarAberta: boolean;
  modoTv: boolean;
  authAberto: boolean;
  wsEstado: "conectando" | "aberto" | "reconectando" | "fechado";
  toggleNavbar: () => void;
  setNavbar: (b: boolean) => void;
  setModoTv: (b: boolean) => void;
  setAuthAberto: (b: boolean) => void;
  setWsEstado: (e: UiState["wsEstado"]) => void;
}

export const useUi = create<UiState>()((set) => ({
  navbarAberta: false,
  modoTv: false,
  authAberto: false,
  wsEstado: "conectando",
  toggleNavbar: () => set((s) => ({ navbarAberta: !s.navbarAberta })),
  setNavbar: (navbarAberta) => set({ navbarAberta }),
  setModoTv: (modoTv) => set({ modoTv }),
  setAuthAberto: (authAberto) => set({ authAberto }),
  setWsEstado: (wsEstado) => set({ wsEstado }),
}));

interface NavDesktopState {
  aberta: boolean;
  toggle: () => void;
}
export const useNavDesktop = create<NavDesktopState>()(
  persistNav((set) => ({ aberta: true, toggle: () => set((s) => ({ aberta: !s.aberta })) }), { name: "eleicoes.nav" }),
);
