import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import { useMemo } from "react";
import { usePrefs } from "../store/prefs";
import { REGISTRO } from "../widgets/registro";
import type { ConfigPainel, LayoutItem, WidgetCfg } from "./schema";
import { WidgetFrame } from "./WidgetFrame";

const GradeResponsiva = WidthProvider(Responsive);

export const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
export const COLS = { lg: 12, md: 10, sm: 6, xs: 1, xxs: 1 };

function empilhar(widgets: WidgetCfg[]): Layout[] {
  let y = 0;
  return [...widgets]
    .sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x)
    .map((w) => {
      const l = { i: w.id, x: 0, y, w: 1, h: Math.max(4, w.pos.h) };
      y += l.h;
      return l;
    });
}

function ajustarCols(base: Layout[], cols: number): Layout[] {
  return base.map((l) => ({ ...l, w: Math.min(cols, Math.max(1, Math.round((l.w / 12) * cols))), x: Math.min(cols - 1, Math.round((l.x / 12) * cols)) }));
}

interface Props {
  config: ConfigPainel;
  editando: boolean;
  somenteLeitura?: boolean;
  modoTv?: boolean;
  onLayout?: (lg: LayoutItem[], outros: Record<string, LayoutItem[]>) => void;
  onConfigurar?: (id: string) => void;
  onDuplicar?: (id: string) => void;
  onRemover?: (id: string) => void;
}

export function Grade({ config, editando, somenteLeitura, modoTv, onLayout, onConfigurar, onDuplicar, onRemover }: Props) {
  const densidade = usePrefs((s) => s.densidade);
  const compacta = densidade === "compacta";
  const rowHeight = modoTv ? 44 : compacta ? 30 : 36;
  const margem: [number, number] = compacta ? [8, 8] : [12, 12];

  const layouts: Layouts = useMemo(() => {
    const lg: Layout[] = config.widgets.map((w) => {
      const d = REGISTRO[w.tipo].tamanho;
      return { i: w.id, ...w.pos, minW: d.minW, minH: d.minH };
    });
    const salvo = config.layouts ?? {};
    const ids = new Set(config.widgets.map((w) => w.id));
    const usarSalvo = (bp: string) => {
      const l = salvo[bp];
      return l && l.length === ids.size && l.every((x) => ids.has(x.i)) ? (l as Layout[]) : null;
    };
    return {
      lg,
      md: usarSalvo("md") ?? ajustarCols(lg, COLS.md),
      sm: usarSalvo("sm") ?? ajustarCols(lg, COLS.sm),
      xs: empilhar(config.widgets),
      xxs: empilhar(config.widgets),
    };
  }, [config.widgets, config.layouts]);

  const podeEditar = editando && !somenteLeitura;

  return (
    <div className={podeEditar ? "grade-editando" : undefined}>
      <GradeResponsiva
        className="layout"
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={rowHeight}
        margin={margem}
        containerPadding={[0, 0]}
        isDraggable={podeEditar}
        isResizable={podeEditar}
        draggableHandle=".alca-arrastar"
        compactType="vertical"
        useCSSTransforms
        onLayoutChange={(_atual: Layout[], todos: Layouts) => {
          if (!podeEditar || !onLayout) return;
          const lg = (todos.lg ?? []).map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
          const outros: Record<string, LayoutItem[]> = {};
          for (const bp of ["md", "sm"] as const)
            if (todos[bp]) outros[bp] = todos[bp].map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
          onLayout(lg, outros);
        }}
      >
        {config.widgets.map((w) => (
          <div key={w.id}>
            <WidgetFrame
              widget={w}
              editando={podeEditar}
              somenteLeitura={somenteLeitura}
              onConfigurar={!somenteLeitura && onConfigurar ? () => onConfigurar(w.id) : undefined}
              onDuplicar={onDuplicar ? () => onDuplicar(w.id) : undefined}
              onRemover={onRemover ? () => onRemover(w.id) : undefined}
            />
          </div>
        ))}
      </GradeResponsiva>
    </div>
  );
}
