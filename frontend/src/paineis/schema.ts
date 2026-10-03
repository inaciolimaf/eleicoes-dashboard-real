import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const TIPOS_WIDGET = [
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
] as const;
export type TipoWidget = (typeof TIPOS_WIDGET)[number];

const nivelZ = z.enum(["br", "uf", "municipio", "zona", "local", "secao"]);

export const filtroGlobalZ = z
  .object({
    ambiente: z.string().optional(),
    ciclo: z.string().nullable().optional(),
    turno: z.number().int().min(1).max(2).default(1),
    cargo: z.number().int().default(1),
    nivel: nivelZ.default("br"),
    recorte: z.string().default("br"),
    tempo: z.string().default("agora"),
  })
  .passthrough();
export type FiltroPainel = z.infer<typeof filtroGlobalZ>;

export const posZ = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});
export type Pos = z.infer<typeof posZ>;

export const filtrosWidgetZ = z
  .object({
    turno: z.number().int().min(1).max(2),
    cargo: z.number().int(),
    nivel: nivelZ,
    recorte: z.string(),
    tempo: z.string(),
  })
  .partial();
export type FiltrosWidget = z.infer<typeof filtrosWidgetZ>;

export const widgetZ = z.object({
  id: z.string().min(1),
  tipo: z.enum(TIPOS_WIDGET),
  pos: posZ,
  herda: z.boolean().default(true),
  filtros: filtrosWidgetZ.optional(),
  config: z.record(z.unknown()).default({}),
});
export type WidgetCfg = z.infer<typeof widgetZ>;

const layoutItemZ = z.object({ i: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type LayoutItem = z.infer<typeof layoutItemZ>;

export const configPainelZ = z
  .object({
    id: z.string().optional(),
    nome: z.string().optional(),
    schemaVersion: z.number().int().default(SCHEMA_VERSION),
    filtroGlobal: filtroGlobalZ,
    widgets: z.array(widgetZ),
    /** layouts por breakpoint (md/sm/xs). O lg vem de widgets[].pos */
    layouts: z.record(z.array(layoutItemZ)).optional(),
  })
  .passthrough();
export type ConfigPainel = z.infer<typeof configPainelZ>;

/** Formato do arquivo exportado/importado */
export const arquivoPainelZ = z.object({
  formato: z.literal("eleicoes-dashboard/painel").optional(),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  nome: z.string().min(1).max(120),
  config: configPainelZ,
});
export type ArquivoPainel = z.infer<typeof arquivoPainelZ>;

/** Migrações futuras: hoje só existe a versão 1. */
export function migrar(cfg: unknown): ConfigPainel | null {
  const r = configPainelZ.safeParse(cfg);
  if (!r.success) return null;
  return { ...r.data, schemaVersion: SCHEMA_VERSION };
}

export function novoIdWidget(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function descreverErroZod(e: z.ZodError): string {
  return e.issues
    .slice(0, 4)
    .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("; ");
}
