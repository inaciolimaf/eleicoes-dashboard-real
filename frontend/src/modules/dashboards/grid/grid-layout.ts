import type { Layout, Layouts } from "react-grid-layout";
import type { DashboardConfig, WidgetCfg } from "../schema";
import { REGISTRY } from "../widgets/registry";

export const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
export const COLS = { lg: 12, md: 10, sm: 6, xs: 1, xxs: 1 };

/** One column, in reading order (small screens). */
export function stackVertically(widgets: WidgetCfg[]): Layout[] {
  let y = 0;
  return [...widgets]
    .sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x)
    .map((widget) => {
      const item = { i: widget.id, x: 0, y, w: 1, h: Math.max(4, widget.pos.h) };
      y += item.h;
      return item;
    });
}

/** Rescales a 12-column layout to `cols` columns. */
export function scaleColumns(base: Layout[], cols: number): Layout[] {
  return base.map((item) => ({
    ...item,
    w: Math.min(cols, Math.max(1, Math.round((item.w / 12) * cols))),
    x: Math.min(cols - 1, Math.round((item.x / 12) * cols)),
  }));
}

/**
 * Layout of every breakpoint. The lg layout comes from the widgets' positions; md and sm use the
 * saved layout when it still matches the widgets, otherwise they are derived from lg.
 */
export function buildLayouts(widgets: WidgetCfg[], savedLayouts: DashboardConfig["layouts"]): Layouts {
  const lg: Layout[] = widgets.map((widget) => {
    const size = REGISTRY[widget.tipo].size;
    return { i: widget.id, ...widget.pos, minW: size.minW, minH: size.minH };
  });
  const saved = savedLayouts ?? {};
  const ids = new Set(widgets.map((widget) => widget.id));
  const savedFor = (breakpoint: string): Layout[] | null => {
    const layout = saved[breakpoint];
    return layout && layout.length === ids.size && layout.every((item) => ids.has(item.i))
      ? (layout as Layout[])
      : null;
  };
  return {
    lg,
    md: savedFor("md") ?? scaleColumns(lg, COLS.md),
    sm: savedFor("sm") ?? scaleColumns(lg, COLS.sm),
    xs: stackVertically(widgets),
    xxs: stackVertically(widgets),
  };
}

/** Whether every widget keeps the position it has in the lg layout (no move, no resize). */
export function samePosition(
  widgets: WidgetCfg[],
  layout: { i: string; x: number; y: number; w: number; h: number }[],
) {
  const byId = new Map(layout.map((item) => [item.i, item]));
  return widgets.every((widget) => {
    const item = byId.get(widget.id);
    return (
      !item ||
      (item.x === widget.pos.x &&
        item.y === widget.pos.y &&
        item.w === widget.pos.w &&
        item.h === widget.pos.h)
    );
  });
}
