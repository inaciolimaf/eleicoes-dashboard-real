import {
  IconChartArcs,
  IconChartDonut,
  IconChartLine,
  IconColumns,
  IconFileCertificate,
  IconGridDots,
  IconListNumbers,
  IconMap2,
  IconNumber,
  IconTable,
} from "@tabler/icons-react";
import { optionPairs, type DefWidget } from "./types";
import { ComparisonWidget } from "./comparison-widgets";
import { MAP_TYPES } from "../../maps";
import { COLUMNS } from "../../results";
import {
  KPI_OPTIONS,
  EvolutionWidget,
  HeatmapWidget,
  HemicycleWidget,
  KpiWidget,
  MapWidget,
  ScoreboardWidget,
  DonutWidget,
  TableWidget,
  TotalsWidget,
} from "./result-widgets";
export type ResultWidgetType =
  | "placar"
  | "totais"
  | "kpi"
  | "mapa"
  | "evolucao"
  | "tabela"
  | "comparativo"
  | "hemiciclo"
  | "rosca"
  | "heatmap";

/** Widgets that show election results. Keys of `config` and option values are saved in the dashboard JSON. */
export const RESULT_DEFINITIONS: Record<ResultWidgetType, DefWidget> = {
  placar: {
    type: "placar",
    name: "Placar de candidatos",
    description:
      "Ranking com barras, votos, % dos válidos e selos de situação. Abas de partidos e hemiciclo nos proporcionais.",
    icon: IconListNumbers,
    size: { w: 5, h: 9, minW: 3, minH: 4 },
    defaults: { topN: 0, soEleitos: false, mostrarFotos: true },
    fields: [
      { key: "topN", label: "Mostrar só os N primeiros (0 = todos)", type: "number", min: 0, max: 100 },
      { key: "soEleitos", label: "Começar mostrando só eleitos", type: "switch" },
      { key: "mostrarFotos", label: "Mostrar fotos", type: "switch" },
    ],
    Component: ScoreboardWidget,
    exportKind: "resultados",
  },
  totais: {
    type: "totais",
    name: "Bloco de totais",
    description:
      "Votos válidos em destaque, brancos, nulos, abstenção, comparecimento e % de seções apuradas.",
    icon: IconFileCertificate,
    size: { w: 5, h: 6, minW: 3, minH: 3 },
    defaults: { compacto: false },
    fields: [{ key: "compacto", label: "Modo compacto", type: "switch" }],
    Component: TotalsWidget,
    exportKind: "resultados",
  },
  kpi: {
    type: "kpi",
    name: "KPI único",
    description: "Um número grande com a variação em relação a N minutos atrás.",
    icon: IconNumber,
    size: { w: 3, h: 4, minW: 2, minH: 3 },
    defaults: { metrica: "votos_validos", compararMin: 15 },
    fields: [
      { key: "metrica", label: "Métrica", type: "select", options: KPI_OPTIONS },
      {
        key: "sqcand",
        label: "Candidato",
        type: "candidate",
        when: (c) => String(c.metrica ?? "").startsWith("candidato"),
      },
      {
        key: "compararMin",
        label: "Comparar com há N minutos (0 = não comparar)",
        type: "number",
        min: 0,
        max: 600,
      },
      { key: "corDestaque", label: "Cor do número", type: "color" },
    ],
    Component: KpiWidget,
    exportKind: "resultados",
  },
  mapa: {
    type: "mapa",
    name: "Mapa",
    description:
      "Vencedores, desempenho, comparativo A×B, progresso, locais apurados, comparecimento ou partido mais votado.",
    icon: IconMap2,
    size: { w: 7, h: 12, minW: 3, minH: 6 },
    defaults: { tipo: "vencedores", nivelFilhos: "auto", basemap: "padrao" },
    fields: [
      {
        key: "tipo",
        label: "Tipo de mapa",
        type: "select",
        options: MAP_TYPES.map((t) => ({ value: t.valor, label: t.rotulo })),
      },
      {
        key: "nivelFilhos",
        label: "No Brasil, desenhar",
        type: "select",
        options: optionPairs([
          ["auto", "UFs"],
          ["municipio", "Todos os municípios"],
        ]),
      },
      {
        key: "candidatoA",
        label: "Candidato (A)",
        type: "candidate",
        when: (c) => c.tipo === "desempenho" || c.tipo === "comparativo",
      },
      {
        key: "candidatoB",
        label: "Candidato B",
        type: "candidate",
        when: (c) => c.tipo === "comparativo",
      },
      {
        key: "basemap",
        label: "Mapa de fundo",
        type: "select",
        options: optionPairs([
          ["padrao", "Conforme preferências"],
          ["sim", "Mostrar"],
          ["nao", "Ocultar"],
        ]),
      },
    ],
    Component: MapWidget,
    exportKind: "filhos",
  },
  evolucao: {
    type: "evolucao",
    name: "Evolução temporal",
    description:
      "% de cada candidato × horário ou × % de seções, votos ou diferença entre os 2 primeiros, com eventos marcados.",
    icon: IconChartLine,
    size: { w: 6, h: 8, minW: 3, minH: 5 },
    defaults: { eixoX: "t", metrica: "pct", estilo: "linha", topN: 6 },
    fields: [
      {
        key: "eixoX",
        label: "Eixo X",
        type: "select",
        options: optionPairs([
          ["t", "Horário"],
          ["pct_secoes", "% de seções apuradas"],
        ]),
      },
      {
        key: "metrica",
        label: "Métrica",
        type: "select",
        options: optionPairs([
          ["pct", "% dos válidos"],
          ["votos", "Votos"],
          ["diferenca", "Diferença 1º − 2º (p.p.)"],
        ]),
      },
      {
        key: "estilo",
        label: "Estilo",
        type: "select",
        options: optionPairs([
          ["linha", "Linha"],
          ["area", "Área"],
        ]),
      },
      { key: "topN", label: "Candidatos exibidos", type: "number", min: 2, max: 20 },
    ],
    Component: EvolutionWidget,
  },
  tabela: {
    type: "tabela",
    name: "Tabela de recortes",
    description:
      "Filhos do recorte com vencedor, margem, % apurado e mini-barras. Filtros combináveis e agrupamentos.",
    icon: IconTable,
    size: { w: 12, h: 10, minW: 4, minH: 5 },
    defaults: { mostrarFiltros: true, nivelFilhos: "auto", topN: 0 },
    fields: [
      {
        key: "colunas",
        label: "Colunas",
        type: "multiselect",
        options: COLUMNS.map((c) => ({ value: c.id, label: c.rotulo })),
      },
      {
        key: "nivelFilhos",
        label: "No Brasil, listar",
        type: "select",
        options: optionPairs([
          ["auto", "UFs"],
          ["municipio", "Todos os municípios"],
        ]),
      },
      { key: "topN", label: "Limitar a N linhas (0 = todas)", type: "number", min: 0, max: 6000 },
      { key: "mostrarFiltros", label: "Mostrar barra de filtros", type: "switch" },
    ],
    Component: TableWidget,
    exportKind: "filhos",
  },
  comparativo: {
    type: "comparativo",
    name: "Comparativo lado a lado",
    description: "2 a 4 recortes lado a lado, ou candidatos comparados nos filhos do recorte.",
    icon: IconColumns,
    size: { w: 8, h: 8, minW: 4, minH: 5 },
    defaults: { modo: "recortes", recortes: ["uf:sp", "uf:mg", "uf:rj"] },
    fields: [
      {
        key: "modo",
        label: "Comparar",
        type: "select",
        options: optionPairs([
          ["recortes", "Recortes"],
          ["candidatos", "Candidatos"],
        ]),
      },
      {
        key: "recortes",
        label: "Recortes (até 4)",
        type: "geoAreas",
        when: (c) => c.modo !== "candidatos",
      },
      {
        key: "candidatos",
        label: "Candidatos (até 4)",
        type: "candidates",
        when: (c) => c.modo === "candidatos",
      },
    ],
    Component: ComparisonWidget,
  },
  hemiciclo: {
    type: "hemiciclo",
    name: "Hemiciclo / vagas",
    description: "Vagas por partido/federação (cargos proporcionais), conforme publicado pelo TSE.",
    icon: IconChartArcs,
    size: { w: 6, h: 9, minW: 3, minH: 5 },
    defaults: {},
    fields: [],
    Component: HemicycleWidget,
    exportKind: "resultados",
  },
  rosca: {
    type: "rosca",
    name: "Rosca de distribuição",
    description: "Distribuição dos votos entre os candidatos (opcionalmente com brancos e nulos).",
    icon: IconChartDonut,
    size: { w: 4, h: 8, minW: 3, minH: 5 },
    defaults: { topN: 6, incluirBrancosNulos: false },
    fields: [
      { key: "topN", label: "Candidatos antes de “Outros”", type: "number", min: 1, max: 20 },
      { key: "incluirBrancosNulos", label: "Incluir brancos e nulos", type: "switch" },
    ],
    Component: DonutWidget,
    exportKind: "resultados",
  },
  heatmap: {
    type: "heatmap",
    name: "Heatmap de progresso por UF",
    description: "Cartograma das UFs colorido pela % de seções apuradas (ou comparecimento).",
    icon: IconGridDots,
    size: { w: 5, h: 9, minW: 3, minH: 6 },
    defaults: { metrica: "pct_secoes" },
    fields: [
      {
        key: "metrica",
        label: "Métrica",
        type: "select",
        options: optionPairs([
          ["pct_secoes", "% de seções apuradas"],
          ["pct_comparecimento", "% de comparecimento"],
        ]),
      },
    ],
    Component: HeatmapWidget,
  },
};
