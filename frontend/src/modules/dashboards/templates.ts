import type { DashboardConfig, WidgetCfg } from "./schema";
import { SCHEMA_VERSION } from "./schema";
import type { Level } from "../../api/models";

export interface Template {
  id: string;
  name: string;
  description: string;
  /** Area the user has to pick when creating the dashboard from this template. */
  needs?: "state" | "municipality" | "polling_place";
  create: (choice: { areaId?: string; name?: string; round?: number }) => DashboardConfig;
}

const makeWidget = (
  id: string,
  type: WidgetCfg["tipo"],
  x: number,
  y: number,
  width: number,
  height: number,
  config: Record<string, unknown> = {},
  extra: Partial<WidgetCfg> = {},
): WidgetCfg => ({
  id,
  tipo: type,
  pos: { x, y, w: width, h: height },
  herda: true,
  config,
  ...extra,
});

const globalFilter = (office: number, level: Level, areaId: string, round = 1) => ({
  ambiente: "oficial",
  ciclo: "ele2026",
  turno: round,
  cargo: office,
  nivel: level,
  recorte: areaId,
  tempo: "agora",
});

export const TEMPLATES: Template[] = [
  {
    id: "noite-eleicao",
    name: "Noite da eleição – Presidente",
    description: "Placar nacional, totais, mapa de vencedores por UF, evolução, progresso e feed de eventos.",
    create: ({ round = 1 } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: "Noite da eleição",
      filtroGlobal: globalFilter(1, "country", "br", round),
      widgets: [
        makeWidget("w1", "placar", 0, 0, 5, 10, { titulo: "Presidente", topN: 0 }),
        makeWidget("w2", "mapa", 5, 0, 7, 14, { tipo: "vencedores" }),
        makeWidget("w3", "totais", 0, 10, 5, 7, {}),
        makeWidget("w4", "evolucao", 0, 17, 7, 8, { eixoX: "t", metrica: "pct" }),
        makeWidget("w5", "heatmap", 5, 14, 7, 9, { metrica: "pct_secoes" }),
        makeWidget("w6", "eventos", 7, 23, 5, 9, { limite: 30 }),
        makeWidget("w7", "relogio", 0, 25, 3, 4, { modo: "relogio" }),
        makeWidget("w8", "kpi", 3, 25, 4, 4, { metrica: "pct_secoes", compararMin: 15 }),
      ],
    }),
  },
  {
    id: "meu-estado",
    name: "Meu estado",
    description: "Governador e Senado da sua UF, mapa dos municípios e tabela com filtros.",
    needs: "state",
    create: ({ areaId = "sp", name } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: name ? `Meu estado – ${name}` : "Meu estado",
      filtroGlobal: globalFilter(3, "state", areaId),
      widgets: [
        makeWidget("w1", "placar", 0, 0, 5, 9, { titulo: "Governador" }),
        makeWidget("w2", "mapa", 5, 0, 7, 13, { tipo: "vencedores" }),
        makeWidget(
          "w3",
          "placar",
          0,
          9,
          5,
          9,
          { titulo: "Senado" },
          { herda: false, filtros: { cargo: 5, nivel: "state", recorte: areaId } },
        ),
        makeWidget("w4", "totais", 5, 13, 7, 6, {}),
        makeWidget("w5", "tabela", 0, 19, 12, 10, {
          colunas: ["nome", "pct_secoes", "lider", "segundo", "margem_pp", "votos_validos", "eleitorado"],
        }),
        makeWidget(
          "w6",
          "placar",
          0,
          29,
          6,
          8,
          { titulo: "Presidente na UF", topN: 4 },
          { herda: false, filtros: { cargo: 1, nivel: "state", recorte: areaId } },
        ),
        makeWidget("w7", "evolucao", 6, 29, 6, 8, {}),
      ],
    }),
  },
  {
    id: "minha-cidade",
    name: "Minha cidade",
    description: "Resultados do seu município: presidente, governador, mapa dos locais de votação e zonas.",
    needs: "municipality",
    create: ({ areaId = "sp71072", name } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: name ? `Minha cidade – ${name}` : "Minha cidade",
      filtroGlobal: globalFilter(1, "municipality", areaId),
      widgets: [
        makeWidget("w1", "placar", 0, 0, 5, 9, { titulo: "Presidente" }),
        makeWidget("w2", "mapa", 5, 0, 7, 13, { tipo: "vencedores" }),
        makeWidget(
          "w3",
          "placar",
          0,
          9,
          5,
          8,
          { titulo: "Governador" },
          { herda: false, filtros: { cargo: 3, nivel: "municipality", recorte: areaId } },
        ),
        makeWidget("w4", "totais", 5, 13, 7, 6, {}),
        makeWidget("w5", "tabela", 0, 19, 12, 9, {}),
        makeWidget("w6", "mapa", 0, 28, 12, 11, { tipo: "locais", titulo: "Locais apurados" }),
      ],
    }),
  },
  {
    id: "meu-colegio",
    name: "Meu colégio",
    description: "Seu local de votação: seções, cobertura dos boletins de urna e resultado agregado.",
    needs: "polling_place",
    create: ({ areaId = "sp71072-z0001-l1015", name } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: name ? `Meu colégio – ${name}` : "Meu colégio",
      filtroGlobal: globalFilter(1, "polling_place", areaId),
      widgets: [
        makeWidget("w1", "local", 0, 0, 5, 12, { localId: areaId }),
        makeWidget("w2", "placar", 5, 0, 7, 9, { titulo: "Presidente no local" }),
        makeWidget("w3", "totais", 5, 9, 7, 6, {}),
        makeWidget(
          "w4",
          "placar",
          0,
          12,
          5,
          8,
          { titulo: "Governador no local" },
          { herda: false, filtros: { cargo: 3, nivel: "polling_place", recorte: areaId } },
        ),
        makeWidget(
          "w5",
          "placar",
          5,
          15,
          7,
          8,
          { titulo: "Senado no local" },
          { herda: false, filtros: { cargo: 5, nivel: "polling_place", recorte: areaId } },
        ),
      ],
    }),
  },
  {
    id: "camara",
    name: "Câmara dos Deputados",
    description: "Deputado Federal: hemiciclo de vagas, partidos/federações e eleitos.",
    needs: "state",
    create: ({ areaId = "sp", name } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: name ? `Câmara – ${name}` : "Câmara dos Deputados",
      filtroGlobal: globalFilter(6, "state", areaId),
      widgets: [
        makeWidget("w1", "hemiciclo", 0, 0, 6, 10, {}),
        makeWidget("w2", "placar", 6, 0, 6, 14, { titulo: "Candidatos mais votados", topN: 25 }),
        makeWidget("w3", "totais", 0, 10, 6, 6, { compacto: true }),
        makeWidget("w4", "mapa", 0, 16, 6, 11, { tipo: "partido" }),
        makeWidget("w5", "rosca", 6, 14, 6, 9, { topN: 8 }),
      ],
    }),
  },
  {
    id: "senado",
    name: "Senado 2026",
    description: "Duas vagas por UF: mapa de UFs, placar de uma UF e progresso nacional.",
    create: () => ({
      schemaVersion: SCHEMA_VERSION,
      nome: "Senado 2026",
      filtroGlobal: globalFilter(5, "country", "br"),
      widgets: [
        makeWidget("w1", "mapa", 0, 0, 7, 13, { tipo: "vencedores", titulo: "Líder por UF" }),
        makeWidget(
          "w2",
          "placar",
          7,
          0,
          5,
          10,
          { titulo: "Senado em SP" },
          { herda: false, filtros: { cargo: 5, nivel: "state", recorte: "sp" } },
        ),
        makeWidget("w3", "tabela", 0, 13, 7, 10, {
          colunas: ["nome", "pct_secoes", "lider", "segundo", "margem_pp", "votos_validos"],
        }),
        makeWidget("w4", "heatmap", 7, 10, 5, 9, {}),
        makeWidget("w5", "eventos", 7, 19, 5, 8, { tipos: ["elected", "lead_change"] }),
      ],
    }),
  },
];

export const defaultTemplate = () => TEMPLATES[0].create({});
