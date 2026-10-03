import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Usuario } from "../api/types";

interface AuthState {
  token: string | null;
  usuario: Usuario | null;
  setSessao: (token: string, usuario: Usuario) => void;
  setUsuario: (usuario: Usuario) => void;
  sair: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      usuario: null,
      setSessao: (token, usuario) => set({ token, usuario }),
      setUsuario: (usuario) => set({ usuario }),
      sair: () => set({ token: null, usuario: null }),
    }),
    { name: "eleicoes.auth" },
  ),
);

export const getToken = () => useAuth.getState().token;
