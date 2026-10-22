import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import { useMemo } from "react";
import { usePrefs } from "../../../lib/prefs-store";
import type { DashboardConfig, LayoutItem } from "../schema";
import { WidgetFrame } from "./WidgetFrame";
import { BREAKPOINTS, COLS, buildLayouts } from "./grid-layout";

const ResponsiveGrid = WidthProvider(Responsive);

interface GridProps {
  config: DashboardConfig;
  editing: boolean;
  readOnly?: boolean;
  tvMode?: boolean;
  onLayoutChange?: (lg: LayoutItem[], others: Record<string, LayoutItem[]>) => void;
  onConfigure?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRemove?: (id: string) => void;
}

const toLayoutItem = ({ i, x, y, w, h }: Layout): LayoutItem => ({ i, x, y, w, h });

/** The dashboard's widgets on a responsive grid; drag and resize only while editing. */
export function Grid({
  config,
  editing,
  readOnly,
  tvMode,
  onLayoutChange,
  onConfigure,
  onDuplicate,
  onRemove,
}: GridProps) {
  const density = usePrefs((s) => s.densidade);
  const compact = density === "compacta";
  const rowHeight = tvMode ? 44 : compact ? 30 : 36;
  const margin: [number, number] = compact ? [8, 8] : [12, 12];
  const layouts: Layouts = useMemo(
    () => buildLayouts(config.widgets, config.layouts),
    [config.widgets, config.layouts],
  );
  const canEdit = editing && !readOnly;

  return (
    <div className={canEdit ? "grade-editando" : undefined}>
      <ResponsiveGrid
        className="layout"
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={rowHeight}
        margin={margin}
        containerPadding={[0, 0]}
        isDraggable={canEdit}
        isResizable={canEdit}
        draggableHandle=".alca-arrastar"
        compactType="vertical"
        useCSSTransforms
        onLayoutChange={(_current: Layout[], all: Layouts) => {
          if (!canEdit || !onLayoutChange) return;
          const lg = (all.lg ?? []).map(toLayoutItem);
          const others: Record<string, LayoutItem[]> = {};
          for (const breakpoint of ["md", "sm"] as const)
            if (all[breakpoint]) others[breakpoint] = all[breakpoint].map(toLayoutItem);
          onLayoutChange(lg, others);
        }}
      >
        {config.widgets.map((widget) => (
          <div key={widget.id}>
            <WidgetFrame
              widget={widget}
              editing={canEdit}
              readOnly={readOnly}
              onConfigure={!readOnly && onConfigure ? () => onConfigure(widget.id) : undefined}
              onDuplicate={onDuplicate ? () => onDuplicate(widget.id) : undefined}
              onRemove={onRemove ? () => onRemove(widget.id) : undefined}
            />
          </div>
        ))}
      </ResponsiveGrid>
    </div>
  );
}
