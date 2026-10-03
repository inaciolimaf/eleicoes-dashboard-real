import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Nivel } from "../api/types";
import { useFiltro } from "../store/filtro";
import { useTempo } from "../store/tempo";
import { cargoParaUf } from "./cargos";
import { ufDoId } from "./recortes";

export interface FiltroEfetivo {
  turno: number;
  cargo: number;
  nivel: Nivel;
  id: string;
  /** ISO ou null (= ao vivo) */
  t: string | null;
}

export type FiltroParcial = Partial<FiltroEfetivo> & { tFixo?: boolean };

const Ctx = createContext<FiltroParcial | null>(null);

/** Sobrescreve partes do filtro global para uma subárvore (widget fixado, painel compartilhado congelado…). */
export function FiltroProvider({ value, children }: { value: FiltroParcial; children: ReactNode }) {
  const pai = useContext(Ctx);
  const merged = useMemo(() => ({ ...(pai ?? {}), ...stripUndef(value) }), [pai, value]);
  return <Ctx.Provider value={merged}>{children}</Ctx.Provider>;
}

function stripUndef(o: FiltroParcial): FiltroParcial {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
  return r as FiltroParcial;
}

export function useFiltroEfetivo(): FiltroEfetivo {
  const g = useFiltro();
  const tGlobal = useTempo((s) => s.t);
  const ctx = useContext(Ctx);
  return useMemo(() => {
    const nivel = ctx?.nivel ?? g.nivel;
    const id = ctx?.id ?? g.id;
    const cargo = cargoParaUf(ctx?.cargo ?? g.cargo, ufDoId(nivel, id));
    return {
      turno: ctx?.turno ?? g.turno,
      cargo,
      nivel,
      id,
      t: ctx && "t" in ctx && ctx.t !== undefined ? ctx.t : tGlobal,
    };
  }, [ctx, g.nivel, g.id, g.cargo, g.turno, tGlobal]);
}

/** true se o contexto atual congela o tempo (painel compartilhado congelado / widget com tempo fixo) */
export function useTempoFixo(): boolean {
  const ctx = useContext(Ctx);
  return !!ctx?.tFixo;
}
