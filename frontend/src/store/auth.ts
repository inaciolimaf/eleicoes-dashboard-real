import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDto } from "../api/models";

interface AuthState {
  token: string | null;
  user: UserDto | null;
  setSessao: (token: string, user: UserDto) => void;
  setUsuario: (user: UserDto) => void;
  sair: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSessao: (token, user) => set({ token, user }),
      setUsuario: (user) => set({ user }),
      sair: () => set({ token: null, user: null }),
    }),
    {
      name: "eleicoes.auth",
      // sessões salvas antes da migração trazem `usuario` (com `nome`): a leitura passa para `user`
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
