import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Level } from "../api/models";
import { useFilter } from "./filter-store";
import { useTime } from "./time-store";
import { officeForState } from "./offices";
import { stateOfId } from "./geo-areas";

export interface EffectiveFilter {
  turno: number;
  cargo: number;
  nivel: Level;
  id: string;
  /** ISO ou null (= ao vivo) */
  t: string | null;
}

export type PartialFilter = Partial<EffectiveFilter> & { tFixo?: boolean };

const Ctx = createContext<PartialFilter | null>(null);

/** Sobrescreve partes do filtro global para uma subárvore (widget fixado, painel compartilhado congelado…). */
export function FilterProvider({ value, children }: { value: PartialFilter; children: ReactNode }) {
  const pai = useContext(Ctx);
  const merged = useMemo(() => ({ ...(pai ?? {}), ...stripUndef(value) }), [pai, value]);
  return <Ctx.Provider value={merged}>{children}</Ctx.Provider>;
}

function stripUndef(o: PartialFilter): PartialFilter {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
  return r as PartialFilter;
}

export function useEffectiveFilter(): EffectiveFilter {
  const g = useFilter();
  const tGlobal = useTime((s) => s.t);
  const ctx = useContext(Ctx);
  return useMemo(() => {
    const nivel = ctx?.nivel ?? g.nivel;
    const id = ctx?.id ?? g.id;
    const cargo = officeForState(ctx?.cargo ?? g.cargo, stateOfId(nivel, id));
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
export function useFixedTime(): boolean {
  const ctx = useContext(Ctx);
  return !!ctx?.tFixo;
}
