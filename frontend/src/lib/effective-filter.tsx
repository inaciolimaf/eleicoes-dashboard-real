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
  /** ISO instant, or null (= live) */
  t: string | null;
}

export type PartialFilter = Partial<EffectiveFilter> & { tFixo?: boolean };

const Ctx = createContext<PartialFilter | null>(null);

/** Overrides parts of the global filter for a subtree (pinned widget, frozen shared dashboard...). */
export function FilterProvider({ value, children }: { value: PartialFilter; children: ReactNode }) {
  const parent = useContext(Ctx);
  const merged = useMemo(() => ({ ...(parent ?? {}), ...stripUndef(value) }), [parent, value]);
  return <Ctx.Provider value={merged}>{children}</Ctx.Provider>;
}

function stripUndef(o: PartialFilter): PartialFilter {
  const r: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(o)) if (value !== undefined) r[key] = value;
  return r as PartialFilter;
}

/** The filter the current screen or widget works with: the global one, overridden by its provider. */
export function useEffectiveFilter(): EffectiveFilter {
  const globalFilter = useFilter();
  const globalTime = useTime((s) => s.t);
  const ctx = useContext(Ctx);
  return useMemo(() => {
    const level = ctx?.nivel ?? globalFilter.nivel;
    const id = ctx?.id ?? globalFilter.id;
    const office = officeForState(ctx?.cargo ?? globalFilter.cargo, stateOfId(level, id));
    return {
      turno: ctx?.turno ?? globalFilter.turno,
      cargo: office,
      nivel: level,
      id,
      t: ctx && "t" in ctx && ctx.t !== undefined ? ctx.t : globalTime,
    };
  }, [ctx, globalFilter.nivel, globalFilter.id, globalFilter.cargo, globalFilter.turno, globalTime]);
}

/** true when the current context freezes time (frozen shared dashboard or widget with a fixed time) */
export function useFixedTime(): boolean {
  const ctx = useContext(Ctx);
  return !!ctx?.tFixo;
}
