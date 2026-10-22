import { keepPreviousData } from "@tanstack/react-query";
import type { EventType, Level } from "./models";
import { useUi } from "../lib/ui-store";

export const qk = {
  status: () => ["status"] as const,
  eleicoes: () => ["eleicoes"] as const,
  resultados: (turno: number, cargo: number, nivel: Level, id: string, t: string | null) =>
    ["resultados", turno, cargo, nivel, id, t] as const,
  serie: (turno: number, cargo: number, nivel: Level, id: string, ate: string | null) =>
    ["serie", turno, cargo, nivel, id, ate] as const,
  filhos: (
    turno: number,
    cargo: number,
    nivel: Level,
    id: string,
    filhos: Level | null,
    candidatos: string,
    t: string | null,
  ) => ["filhos", turno, cargo, nivel, id, filhos, candidatos, t] as const,
  progresso: (turno: number, t: string | null) => ["progresso", turno, t] as const,
  locais: (turno: number, cargo: number, uf: string | null, municipio: string | null, t: string | null) =>
    ["locais", turno, cargo, uf, municipio, t] as const,
  local: (id: string, turno: number) => ["local", id, turno] as const,
  secao: (id: string, turno: number) => ["secao", id, turno] as const,
  candidatos: (turno: number, cargo: number, uf: string | null) => ["candidatos", turno, cargo, uf] as const,
  candidato: (sq: string, turno: number, t: string | null) => ["candidato", sq, turno, t] as const,
  eventos: (turno: number, f: EventFilter) => ["eventos", turno, f] as const,
  linha: (turno: number) => ["linha", turno] as const,
  busca: (q: string) => ["busca", q] as const,
  me: () => ["me"] as const,
  paineis: () => ["paineis"] as const,
  favoritos: () => ["favoritos"] as const,
  alertas: () => ["alertas"] as const,
  preferencias: () => ["preferencias"] as const,
  adminSaude: () => ["admin", "saude"] as const,
  adminFake: () => ["admin", "fake"] as const,
};

export interface EventFilter {
  office?: number | null;
  level?: Level | null;
  id?: string | null;
  types?: EventType[];
  limit?: number;
}

/** Common options. Live: the cache is patched by the WebSocket, with a safety poll (more often if the socket is down). With a time T: immutable history. */
export function timeQueryOptions(t: string | null, wsAberto: boolean) {
  return t
    ? { staleTime: Infinity, gcTime: 5 * 60_000, placeholderData: keepPreviousData }
    : {
        staleTime: 20_000,
        refetchInterval: wsAberto ? 60_000 : 30_000,
        placeholderData: keepPreviousData,
      };
}

/** true while the WebSocket is open. */
export const useWsOpen = () => useUi((s) => s.wsStatus === "open");
