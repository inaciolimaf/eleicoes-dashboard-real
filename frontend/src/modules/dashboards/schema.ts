import { z } from "zod";
import type { Level } from "../../api/models";

/**
 * Version of the dashboard JSON stored in `dashboards.config` and in `localStorage`.
 * The keys of that JSON (`filtroGlobal`, `herda`, `nivelFilhos`, widget type ids...) are user
 * data: they keep their Portuguese names so saved dashboards and shared links still load.
 */
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

/** Levels saved before the API moved to English names: reading accepts both vocabularies. */
const LEGACY_LEVELS: Record<string, Level> = {
  br: "country",
  uf: "state",
  municipio: "municipality",
  zona: "zone",
  local: "polling_place",
  secao: "section",
};
const levelSchema = z
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
  .transform((value): Level => LEGACY_LEVELS[value] ?? (value as Level));

export const globalFilterSchema = z
  .object({
    ambiente: z.string().optional(),
    ciclo: z.string().nullable().optional(),
    turno: z.number().int().min(1).max(2).default(1),
    cargo: z.number().int().default(1),
    nivel: levelSchema.default("br"),
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
    nivel: levelSchema,
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

const layoutItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type LayoutItem = z.infer<typeof layoutItemSchema>;

export const dashboardConfigSchema = z
  .object({
    id: z.string().optional(),
    nome: z.string().optional(),
    schemaVersion: z.number().int().default(SCHEMA_VERSION),
    filtroGlobal: globalFilterSchema,
    widgets: z.array(widgetSchema),
    /** Layouts per breakpoint (md/sm/xs). The lg layout comes from widgets[].pos. */
    layouts: z.record(z.array(layoutItemSchema)).optional(),
  })
  .passthrough();
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;

/** Format of the exported/imported file. */
export const dashboardFileSchema = z.object({
  formato: z.literal("eleicoes-dashboard/painel").optional(),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  nome: z.string().min(1).max(120),
  config: dashboardConfigSchema,
});
export type DashboardFile = z.infer<typeof dashboardFileSchema>;

/** Parses a stored config; `null` when it does not match the schema. Only version 1 exists. */
export function migrate(config: unknown): DashboardConfig | null {
  const parsed = dashboardConfigSchema.safeParse(config);
  if (!parsed.success) return null;
  return { ...parsed.data, schemaVersion: SCHEMA_VERSION };
}

/** Sequence within the process: ids made in the same millisecond still differ. */
let widgetSequence = 0;

export function newWidgetId(): string {
  widgetSequence += 1;
  return `w${Date.now().toString(36)}${widgetSequence.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function describeZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("; ");
}
