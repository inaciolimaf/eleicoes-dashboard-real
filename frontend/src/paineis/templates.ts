import type { ConfigPainel, WidgetCfg } from "./schema";
import { SCHEMA_VERSION } from "./schema";
import type { Nivel } from "../api/types";

export interface Template {
  id: string;
  nome: string;
  descricao: string;
  /** recorte que o usuário precisa escolher ao criar */
  pede?: "uf" | "municipio" | "local";
  criar: (p: { nivel?: Nivel; recorte?: string; nome?: string; turno?: number }) => ConfigPainel;
}

const w = (id: string, tipo: WidgetCfg["tipo"], x: number, y: number, ww: number, h: number, config: Record<string, unknown> = {}, extra: Partial<WidgetCfg> = {}): WidgetCfg => ({
  id,
  tipo,
  pos: { x, y, w: ww, h },
  herda: true,
  config,
  ...extra,
});

const filtro = (cargo: number, nivel: Nivel, recorte: string, turno = 1) => ({
  ambiente: "oficial",
  ciclo: "ele2026",
  turno,
  cargo,
  nivel,
  recorte,
  tempo: "agora",
});

export const TEMPLATES: Template[] = [
  {
    id: "noite-eleicao",
    nome: "Noite da eleição – Presidente",
    descricao: "Placar nacional, totais, mapa de vencedores por UF, evolução, progresso e feed de eventos.",
    criar: ({ turno = 1 } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: "Noite da eleição",
      filtroGlobal: filtro(1, "br", "br", turno),
      widgets: [
        w("w1", "placar", 0, 0, 5, 10, { titulo: "Presidente", topN: 0 }),
        w("w2", "mapa", 5, 0, 7, 14, { tipo: "vencedores" }),
        w("w3", "totais", 0, 10, 5, 7, {}),
        w("w4", "evolucao", 0, 17, 7, 8, { eixoX: "t", metrica: "pct" }),
        w("w5", "heatmap", 5, 14, 7, 9, { metrica: "pct_secoes" }),
        w("w6", "eventos", 7, 23, 5, 9, { limite: 30 }),
        w("w7", "relogio", 0, 25, 3, 4, { modo: "relogio" }),
        w("w8", "kpi", 3, 25, 4, 4, { metrica: "pct_secoes", compararMin: 15 }),
      ],
    }),
  },
  {
    id: "meu-estado",
    nome: "Meu estado",
    descricao: "Governador e Senado da sua UF, mapa dos municípios e tabela com filtros.",
    pede: "uf",
    criar: ({ recorte = "sp", nome } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: nome ? `Meu estado – ${nome}` : "Meu estado",
      filtroGlobal: filtro(3, "uf", recorte),
      widgets: [
        w("w1", "placar", 0, 0, 5, 9, { titulo: "Governador" }),
        w("w2", "mapa", 5, 0, 7, 13, { tipo: "vencedores" }),
        w("w3", "placar", 0, 9, 5, 9, { titulo: "Senado" }, { herda: false, filtros: { cargo: 5, nivel: "uf", recorte } }),
        w("w4", "totais", 5, 13, 7, 6, {}),
        w("w5", "tabela", 0, 19, 12, 10, { colunas: ["nome", "pct_secoes", "lider", "segundo", "margem_pp", "votos_validos", "eleitorado"] }),
        w("w6", "placar", 0, 29, 6, 8, { titulo: "Presidente na UF", topN: 4 }, { herda: false, filtros: { cargo: 1, nivel: "uf", recorte } }),
        w("w7", "evolucao", 6, 29, 6, 8, {}),
      ],
    }),
  },
  {
    id: "minha-cidade",
    nome: "Minha cidade",
    descricao: "Resultados do seu município: presidente, governador, mapa dos locais de votação e zonas.",
    pede: "municipio",
    criar: ({ recorte = "sp71072", nome } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: nome ? `Minha cidade – ${nome}` : "Minha cidade",
      filtroGlobal: filtro(1, "municipio", recorte),
      widgets: [
        w("w1", "placar", 0, 0, 5, 9, { titulo: "Presidente" }),
        w("w2", "mapa", 5, 0, 7, 13, { tipo: "vencedores" }),
        w("w3", "placar", 0, 9, 5, 8, { titulo: "Governador" }, { herda: false, filtros: { cargo: 3, nivel: "municipio", recorte } }),
        w("w4", "totais", 5, 13, 7, 6, {}),
        w("w5", "tabela", 0, 19, 12, 9, {}),
        w("w6", "mapa", 0, 28, 12, 11, { tipo: "locais", titulo: "Locais apurados" }),
      ],
    }),
  },
  {
    id: "meu-colegio",
    nome: "Meu colégio",
    descricao: "Seu local de votação: seções, cobertura dos boletins de urna e resultado agregado.",
    pede: "local",
    criar: ({ recorte = "sp71072-z0001-l1015", nome } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: nome ? `Meu colégio – ${nome}` : "Meu colégio",
      filtroGlobal: filtro(1, "local", recorte),
      widgets: [
        w("w1", "local", 0, 0, 5, 12, { localId: recorte }),
        w("w2", "placar", 5, 0, 7, 9, { titulo: "Presidente no local" }),
        w("w3", "totais", 5, 9, 7, 6, {}),
        w("w4", "placar", 0, 12, 5, 8, { titulo: "Governador no local" }, { herda: false, filtros: { cargo: 3, nivel: "local", recorte } }),
        w("w5", "placar", 5, 15, 7, 8, { titulo: "Senado no local" }, { herda: false, filtros: { cargo: 5, nivel: "local", recorte } }),
      ],
    }),
  },
  {
    id: "camara",
    nome: "Câmara dos Deputados",
    descricao: "Deputado Federal: hemiciclo de vagas, partidos/federações e eleitos.",
    pede: "uf",
    criar: ({ recorte = "sp", nome } = {}) => ({
      schemaVersion: SCHEMA_VERSION,
      nome: nome ? `Câmara – ${nome}` : "Câmara dos Deputados",
      filtroGlobal: filtro(6, "uf", recorte),
      widgets: [
        w("w1", "hemiciclo", 0, 0, 6, 10, {}),
        w("w2", "placar", 6, 0, 6, 14, { titulo: "Candidatos mais votados", topN: 25 }),
        w("w3", "totais", 0, 10, 6, 6, { compacto: true }),
        w("w4", "mapa", 0, 16, 6, 11, { tipo: "partido" }),
        w("w5", "rosca", 6, 14, 6, 9, { topN: 8 }),
      ],
    }),
  },
  {
    id: "senado",
    nome: "Senado 2026",
    descricao: "Duas vagas por UF: mapa de UFs, placar de uma UF e progresso nacional.",
    criar: () => ({
      schemaVersion: SCHEMA_VERSION,
      nome: "Senado 2026",
      filtroGlobal: filtro(5, "br", "br"),
      widgets: [
        w("w1", "mapa", 0, 0, 7, 13, { tipo: "vencedores", titulo: "Líder por UF" }),
        w("w2", "placar", 7, 0, 5, 10, { titulo: "Senado em SP" }, { herda: false, filtros: { cargo: 5, nivel: "uf", recorte: "sp" } }),
        w("w3", "tabela", 0, 13, 7, 10, { colunas: ["nome", "pct_secoes", "lider", "segundo", "margem_pp", "votos_validos"] }),
        w("w4", "heatmap", 7, 10, 5, 9, {}),
        w("w5", "eventos", 7, 19, 5, 8, { tipos: ["eleito", "virada"] }),
      ],
    }),
  },
];

export const templatePadrao = () => TEMPLATES[0].criar({});
