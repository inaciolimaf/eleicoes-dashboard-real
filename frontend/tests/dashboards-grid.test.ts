import { describe, expect, it } from "vitest";
import { plainConfig } from "./helpers/data-dashboards";
import {
  buildLayouts,
  samePosition,
  scaleColumns,
  stackVertically,
} from "../src/modules/dashboards/grid/grid-layout";
import { widgetFilter } from "../src/modules/dashboards/grid/widget-filter";
import {
  addWidget,
  applyLayoutChange,
  duplicateWidget,
  removeWidget,
} from "../src/modules/dashboards/view/edit-actions";
import { migrate, type DashboardConfig, type WidgetCfg } from "../src/modules/dashboards/schema";
import { REGISTRY } from "../src/modules/dashboards/widgets/registry";
import { CATALOG, COMMON_FIELDS } from "../src/modules/dashboards/widgets/registry";
import {
  configArray,
  configBool,
  configNumber,
  configString,
  configStringOrNull,
  optionPairs,
} from "../src/modules/dashboards/widgets/types";
import { WIDGET_TYPES } from "../src/modules/dashboards/schema";

const config = (): DashboardConfig => migrate(plainConfig())!;

function widget(id: string, x: number, y: number, w = 2, h = 4, extra: Partial<WidgetCfg> = {}): WidgetCfg {
  return { id, tipo: "texto", pos: { x, y, w, h }, herda: true, config: {}, ...extra };
}

describe("grid layout", () => {
  it("stacks the widgets in one column in reading order, never shorter than 4 rows", () => {
    const layout = stackVertically([
      widget("b", 6, 0, 2, 2),
      widget("a", 0, 0, 2, 6),
      widget("c", 0, 6, 2, 4),
    ]);
    expect(layout.map((item) => item.i)).toEqual(["a", "b", "c"]);
    expect(layout.map((item) => item.y)).toEqual([0, 6, 10]);
    expect(layout[1].h).toBe(4);
    expect(layout.every((item) => item.x === 0 && item.w === 1)).toBe(true);
  });

  it("rescales a 12-column layout and keeps the widths inside the new column count", () => {
    const [scaled] = scaleColumns([{ i: "a", x: 11, y: 0, w: 12, h: 2 }], 6);
    expect(scaled).toMatchObject({ x: 5, w: 6 });
    const [narrow] = scaleColumns([{ i: "a", x: 0, y: 0, w: 1, h: 2 }], 1);
    expect(narrow).toMatchObject({ x: 0, w: 1 });
  });

  it("uses the saved md layout while it matches the widgets, and derives it otherwise", () => {
    const widgets = [widget("w1", 0, 0), widget("w2", 2, 0)];
    const saved = {
      md: [
        { i: "w1", x: 0, y: 0, w: 4, h: 4 },
        { i: "w2", x: 4, y: 0, w: 4, h: 4 },
      ],
    };
    expect(buildLayouts(widgets, saved).md).toEqual(saved.md);

    const stale = { md: [{ i: "gone", x: 0, y: 0, w: 4, h: 4 }] };
    const derived = buildLayouts(widgets, stale).md;
    expect(derived.map((item) => item.i)).toEqual(["w1", "w2"]);
    expect(buildLayouts(widgets, undefined).sm).toHaveLength(2);
  });

  it("carries the minimum size of the widget type into the lg layout", () => {
    const [item] = buildLayouts([widget("w1", 0, 0, 2, 4, { tipo: "placar" })], undefined).lg;
    expect(item).toMatchObject({ i: "w1", minW: REGISTRY.placar.size.minW, minH: REGISTRY.placar.size.minH });
  });

  it("tells whether each widget kept its position", () => {
    const widgets = [widget("w1", 0, 0, 2, 4)];
    expect(samePosition(widgets, [{ i: "w1", x: 0, y: 0, w: 2, h: 4 }])).toBe(true);
    expect(samePosition(widgets, [{ i: "w1", x: 1, y: 0, w: 2, h: 4 }])).toBe(false);
    expect(samePosition(widgets, [{ i: "other", x: 9, y: 9, w: 9, h: 9 }])).toBe(true);
  });
});

describe("widget filter", () => {
  it("inherits the dashboard filter by default and when no filter is saved", () => {
    expect(widgetFilter(widget("w1", 0, 0))).toBeNull();
    expect(widgetFilter(widget("w1", 0, 0, 2, 4, { herda: false }))).toBeNull();
  });

  it("turns a fixed filter into an override of the context, with the time when frozen", () => {
    const live = widgetFilter(
      widget("w1", 0, 0, 2, 4, {
        herda: false,
        filtros: { turno: 2, cargo: 5, nivel: "state", recorte: "sp", tempo: "agora" },
      }),
    );
    expect(live).toEqual({ turno: 2, cargo: 5, nivel: "state", id: "sp", t: null, tFixo: false });

    const frozen = widgetFilter(
      widget("w2", 0, 0, 2, 4, { herda: false, filtros: { tempo: "2026-10-04T20:00:00Z" } }),
    );
    expect(frozen).toEqual({ t: "2026-10-04T20:00:00Z", tFixo: true });
  });
});

describe("edit actions on a config", () => {
  it("adds a widget below the lowest one, with the default size and configuration of its type", () => {
    const base = config();
    const next = addWidget(base, "texto");
    const added = next.widgets[next.widgets.length - 1];
    expect(added.tipo).toBe("texto");
    expect(added.pos).toMatchObject({ x: 0, y: 4, w: REGISTRY.texto.size.w, h: REGISTRY.texto.size.h });
    expect(added.config).toEqual(REGISTRY.texto.defaults);
    expect(next.layouts).toBeUndefined();
    expect(base.widgets).toHaveLength(2);
  });

  it("duplicates a widget to the bottom with a new id, and ignores an unknown id", () => {
    const base = config();
    const next = duplicateWidget(base, "w2");
    const copy = next.widgets[next.widgets.length - 1];
    expect(copy.id).not.toBe("w2");
    expect(copy.tipo).toBe("relogio");
    expect(copy.pos.x).toBe(0);
    expect(duplicateWidget(base, "nao-existe")).toBe(base);
  });

  it("removes a widget and drops the saved layouts", () => {
    const next = removeWidget({ ...config(), layouts: { md: [] } }, "w1");
    expect(next.widgets.map((w) => w.id)).toEqual(["w2"]);
    expect(next.layouts).toBeUndefined();
  });

  it("stores a moved grid as the new positions and the other breakpoints", () => {
    const base = config();
    const moved = applyLayoutChange(
      base,
      [
        { i: "w1", x: 3, y: 1, w: 5, h: 4 },
        { i: "w2", x: 0, y: 0, w: 3, h: 4 },
      ],
      { md: [{ i: "w1", x: 0, y: 0, w: 4, h: 4 }] },
    );
    expect(moved.widgets[0].pos).toEqual({ x: 3, y: 1, w: 5, h: 4 });
    expect(moved.layouts?.md).toHaveLength(1);
  });

  it("returns the same config when nothing moved", () => {
    const base = config();
    const same = applyLayoutChange(
      base,
      [
        { i: "w1", x: 0, y: 0, w: 4, h: 4 },
        { i: "w2", x: 4, y: 0, w: 3, h: 4 },
      ],
      {},
    );
    expect(same).toBe(base);
  });
});

describe("widget registry", () => {
  it("defines every widget type, once, in catalog order", () => {
    expect(Object.keys(REGISTRY).sort()).toEqual([...WIDGET_TYPES].sort());
    for (const type of WIDGET_TYPES) expect(REGISTRY[type].type).toBe(type);
    expect(CATALOG.map((d) => d.type)).toEqual([
      "placar",
      "totais",
      "kpi",
      "mapa",
      "evolucao",
      "tabela",
      "comparativo",
      "hemiciclo",
      "rosca",
      "heatmap",
      "eventos",
      "candidato",
      "local",
      "secao",
      "relogio",
      "texto",
    ]);
  });

  it("shows the field of a condition only when the configuration asks for it", () => {
    const clock = REGISTRY.relogio.fields.find((field) => field.key === "alvo");
    expect(clock?.when?.({ modo: "relogio" })).toBe(false);
    expect(clock?.when?.({ modo: "contagem" })).toBe(true);
    expect(COMMON_FIELDS.map((field) => field.key)).toEqual(["titulo", "clique"]);
  });

  it("lists the KPI metrics with their Portuguese labels and the candidate field under its condition", () => {
    const kpi = REGISTRY.kpi.fields;
    expect(kpi.find((f) => f.key === "metrica")?.options?.[0]).toEqual({
      value: "votos_validos",
      label: "Votos válidos",
    });
    const candidate = kpi.find((f) => f.key === "sqcand");
    expect(candidate?.when?.({ metrica: "candidato_pct" })).toBe(true);
    expect(candidate?.when?.({ metrica: "pct_secoes" })).toBe(false);
  });
});

describe("configuration readers", () => {
  const values = { n: 4, s: "abc", empty: "", b: false, list: ["a", 1, "b"], nul: null };

  it("return the saved value of the right type, or the fallback", () => {
    expect(configNumber(values, "n", 0)).toBe(4);
    expect(configNumber(values, "s", 9)).toBe(9);
    expect(configString(values, "s", "x")).toBe("abc");
    expect(configString(values, "empty", "x")).toBe("x");
    expect(configBool(values, "b", true)).toBe(false);
    expect(configBool(values, "n", true)).toBe(true);
    expect(configArray(values, "list")).toEqual(["a", "b"]);
    expect(configArray(values, "n")).toEqual([]);
    expect(configStringOrNull(values, "s")).toBe("abc");
    expect(configStringOrNull(values, "empty")).toBeNull();
    expect(configStringOrNull(values, "nul")).toBeNull();
  });

  it("builds option lists from pairs", () => {
    expect(optionPairs([["a", "Alfa"]])).toEqual([{ value: "a", label: "Alfa" }]);
  });
});
