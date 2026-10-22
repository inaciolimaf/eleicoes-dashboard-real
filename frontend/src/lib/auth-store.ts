import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDto } from "../api/models";

interface AuthState {
  token: string | null;
  user: UserDto | null;
  setSession: (token: string, user: UserDto) => void;
  setUser: (user: UserDto) => void;
  signOut: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      signOut: () => set({ token: null, user: null }),
    }),
    {
      name: "eleicoes.auth",
      // sessions saved before the migration carry `usuario` (with `nome`): they are read as `user`
      merge: (salvo, atual) => {
        const legado = (salvo as { usuario?: { id: string; email: string; nome: string; is_admin: boolean } })
          .usuario;
        const user = (salvo as Partial<AuthState>).user ?? (legado ? { ...legado, name: legado.nome } : null);
        return { ...atual, ...(salvo as Partial<AuthState>), user };
      },
    },
  ),
);

export const getToken = () => useAuth.getState().token;
