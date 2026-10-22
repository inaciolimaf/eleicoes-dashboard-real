import { z } from "zod";
import type { Level } from "../../api/models";

export const SCHEMA_VERSION = 1;

export const WIDGET_TYPES = [
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
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Níveis salvos antes da migração para a API em inglês: a leitura aceita os dois vocabulários. */
const NIVEL_LEGADO: Record<string, Level> = {
  br: "country",
  uf: "state",
  municipio: "municipality",
  zona: "zone",
  local: "polling_place",
  secao: "section",
};
const nivelZ = z
  .enum([
    "br",
    "uf",
    "municipio",
    "zona",
    "local",
    "secao",
    "country",
    "state",
    "municipality",
    "zone",
    "polling_place",
    "section",
  ])
  .transform((v): Level => NIVEL_LEGADO[v] ?? (v as Level));

export const globalFilterSchema = z
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
export type DashboardFilter = z.infer<typeof globalFilterSchema>;

export const positionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});
export type Position = z.infer<typeof positionSchema>;

export const widgetFiltersSchema = z
  .object({
    turno: z.number().int().min(1).max(2),
    cargo: z.number().int(),
    nivel: nivelZ,
    recorte: z.string(),
    tempo: z.string(),
  })
  .partial();
export type WidgetFilters = z.infer<typeof widgetFiltersSchema>;

export const widgetSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum(WIDGET_TYPES),
  pos: positionSchema,
  herda: z.boolean().default(true),
  filtros: widgetFiltersSchema.optional(),
  config: z.record(z.unknown()).default({}),
});
export type WidgetCfg = z.infer<typeof widgetSchema>;

const layoutItemZ = z.object({ i: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type LayoutItem = z.infer<typeof layoutItemZ>;

export const dashboardConfigSchema = z
  .object({
    id: z.string().optional(),
    nome: z.string().optional(),
    schemaVersion: z.number().int().default(SCHEMA_VERSION),
    filtroGlobal: globalFilterSchema,
    widgets: z.array(widgetSchema),
    /** layouts por breakpoint (md/sm/xs). O lg vem de widgets[].pos */
    layouts: z.record(z.array(layoutItemZ)).optional(),
  })
  .passthrough();
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;

/** Formato do arquivo exportado/importado */
export const dashboardFileSchema = z.object({
  formato: z.literal("eleicoes-dashboard/painel").optional(),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  nome: z.string().min(1).max(120),
  config: dashboardConfigSchema,
});
export type DashboardFile = z.infer<typeof dashboardFileSchema>;

/** Migrações futuras: hoje só existe a versão 1. */
export function migrate(cfg: unknown): DashboardConfig | null {
  const r = dashboardConfigSchema.safeParse(cfg);
  if (!r.success) return null;
  return { ...r.data, schemaVersion: SCHEMA_VERSION };
}

export function newWidgetId(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function describeZodError(e: z.ZodError): string {
  return e.issues
    .slice(0, 4)
    .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("; ");
}
