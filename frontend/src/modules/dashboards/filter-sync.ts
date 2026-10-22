import { useFilter } from "../../lib/filter-store";
import { useTime } from "../../lib/time-store";
import type { DashboardConfig } from "./schema";

/** Loads a dashboard's global filter (area, office, round, time) into the app-wide filter stores. */
export function applyGlobalFilter(config: DashboardConfig) {
  const filter = config.filtroGlobal;
  useFilter.getState().setFiltro({
    ciclo: filter.ciclo ?? null,
    turno: filter.turno,
    cargo: filter.cargo,
    nivel: filter.nivel,
    id: filter.recorte,
    nome: undefined,
  });
  if (filter.tempo && filter.tempo !== "agora") useTime.getState().setT(filter.tempo);
}
