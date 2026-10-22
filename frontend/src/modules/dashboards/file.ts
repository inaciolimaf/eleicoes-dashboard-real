import { downloadJson } from "../../lib/export";
import { slug } from "../../lib/formatting";
import {
  SCHEMA_VERSION,
  dashboardConfigSchema,
  dashboardFileSchema,
  describeZodError,
  type DashboardConfig,
} from "./schema";

/** Reads an exported file (full format or only the config). Throws a message the user can read. */
export function readDashboardFile(text: string): { name: string; config: DashboardConfig } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }
  const full = dashboardFileSchema.safeParse(json);
  if (full.success) return { name: full.data.nome, config: full.data.config };
  const configOnly = dashboardConfigSchema.safeParse(json);
  if (configOnly.success)
    return { name: configOnly.data.nome ?? "Painel importado", config: configOnly.data };
  throw new Error(`Arquivo de painel inválido: ${describeZodError(full.error)}`);
}

/** Saves a dashboard as a JSON file, in the format `readDashboardFile` reads back. */
export function downloadDashboardFile(name: string, config: DashboardConfig) {
  downloadJson(
    {
      formato: "eleicoes-dashboard/painel",
      schemaVersion: SCHEMA_VERSION,
      nome: name,
      config,
    },
    `painel-${slug(name)}.json`,
  );
}
