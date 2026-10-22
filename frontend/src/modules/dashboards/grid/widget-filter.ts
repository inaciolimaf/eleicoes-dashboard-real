import type { PartialFilter } from "../../../lib/effective-filter";
import type { WidgetCfg } from "../schema";

/** Filter fixed on a widget (it does not inherit the dashboard's filter), as an override of the context. */
export function widgetFilter(widget: WidgetCfg): PartialFilter | null {
  if (widget.herda || !widget.filtros) return null;
  const fixed = widget.filtros;
  const filter: PartialFilter = {};
  if (fixed.turno) filter.turno = fixed.turno;
  if (fixed.cargo) filter.cargo = fixed.cargo;
  if (fixed.nivel && fixed.recorte) {
    filter.nivel = fixed.nivel;
    filter.id = fixed.recorte;
  }
  if (fixed.tempo) {
    filter.t = fixed.tempo === "agora" ? null : fixed.tempo;
    filter.tFixo = fixed.tempo !== "agora";
  }
  return filter;
}
