import type { DashboardConfig, LayoutItem, WidgetCfg, WidgetType } from "../schema";
import { newWidgetId } from "../schema";
import { samePosition } from "../grid/grid-layout";
import { REGISTRY } from "../widgets/registry";

/** The row below the lowest widget: where new and duplicated widgets go. */
const bottomOf = (widgets: WidgetCfg[]) =>
  widgets.reduce((max, widget) => Math.max(max, widget.pos.y + widget.pos.h), 0);

/** Adds a widget of `type` at the bottom, with its default size and configuration. */
export function addWidget(config: DashboardConfig, type: WidgetType): DashboardConfig {
  const definition = REGISTRY[type];
  const widget: WidgetCfg = {
    id: newWidgetId(),
    tipo: type,
    pos: { x: 0, y: bottomOf(config.widgets), w: definition.size.w, h: definition.size.h },
    herda: true,
    config: { ...definition.defaults },
  };
  return { ...config, widgets: [...config.widgets, widget], layouts: undefined };
}

/** Copies a widget to the bottom of the dashboard with a new id. */
export function duplicateWidget(config: DashboardConfig, id: string): DashboardConfig {
  const source = config.widgets.find((widget) => widget.id === id);
  if (!source) return config;
  const copy = { ...source, id: newWidgetId(), pos: { ...source.pos, x: 0, y: bottomOf(config.widgets) } };
  return { ...config, widgets: [...config.widgets, copy], layouts: undefined };
}

export function removeWidget(config: DashboardConfig, id: string): DashboardConfig {
  return { ...config, widgets: config.widgets.filter((widget) => widget.id !== id), layouts: undefined };
}

/** Stores a layout change from the grid: positions from lg, and the md/sm layouts. Returns the same object when nothing moved. */
export function applyLayoutChange(
  config: DashboardConfig,
  lg: LayoutItem[],
  others: Record<string, LayoutItem[]>,
): DashboardConfig {
  const positionChanged = !samePosition(config.widgets, lg);
  const layoutsChanged =
    JSON.stringify(config.layouts ?? {}) !== JSON.stringify({ ...(config.layouts ?? {}), ...others });
  if (!positionChanged && !layoutsChanged) return config;
  const byId = new Map(lg.map((item) => [item.i, item]));
  return {
    ...config,
    widgets: config.widgets.map((widget) => {
      const item = byId.get(widget.id);
      return item ? { ...widget, pos: { x: item.x, y: item.y, w: item.w, h: item.h } } : widget;
    }),
    layouts: { ...(config.layouts ?? {}), ...others },
  };
}
