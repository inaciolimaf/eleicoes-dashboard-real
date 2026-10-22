import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadJson } from "../src/lib/export";
import {
  SCHEMA_VERSION,
  describeZodError,
  dashboardConfigSchema,
  migrate,
  newWidgetId,
} from "../src/modules/dashboards/schema";
import { readDashboardFile, downloadDashboardFile } from "../src/modules/dashboards/file";
import { plainConfig } from "./helpers/data-dashboards";

vi.mock("../src/lib/export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/export")>()),
  downloadJson: vi.fn(),
}));

describe("stored dashboard config (schema)", () => {
  it("keeps the saved keys (filtroGlobal, herda, nivelFilhos) when parsing", () => {
    const config = migrate({
      ...plainConfig("Antigo"),
      widgets: [
        {
          id: "w9",
          tipo: "mapa",
          pos: { x: 0, y: 0, w: 6, h: 6 },
          herda: false,
          config: { nivelFilhos: "municipio" },
          filtros: { nivel: "state", recorte: "sp" },
        },
      ],
    });
    expect(config?.filtroGlobal.nivel).toBe("country");
    expect(config?.widgets[0].herda).toBe(false);
    expect(config?.widgets[0].config).toEqual({ nivelFilhos: "municipio" });
    expect(config?.widgets[0].filtros).toEqual({ nivel: "state", recorte: "sp" });
  });

  it("reads the levels saved with the Portuguese vocabulary as the English ones", () => {
    const pairs: [string, string][] = [
      ["br", "country"],
      ["uf", "state"],
      ["municipio", "municipality"],
      ["zona", "zone"],
      ["local", "polling_place"],
      ["secao", "section"],
    ];
    for (const [saved, english] of pairs) {
      const config = migrate({
        ...plainConfig(),
        filtroGlobal: { ...plainConfig().filtroGlobal, nivel: saved },
      });
      expect(config?.filtroGlobal.nivel).toBe(english);
    }
  });

  it("returns null for a config that does not match the schema, and stamps the current version", () => {
    expect(migrate({ widgets: "nope" })).toBeNull();
    expect(migrate(null)).toBeNull();
    expect(migrate({ ...plainConfig(), schemaVersion: 7 })?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("rejects a widget type that does not exist", () => {
    const parsed = dashboardConfigSchema.safeParse({
      ...plainConfig(),
      widgets: [{ id: "x", tipo: "inexistente", pos: { x: 0, y: 0, w: 1, h: 1 } }],
    });
    expect(parsed.success).toBe(false);
  });

  it("generates distinct widget ids with the w prefix", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newWidgetId()));
    expect(ids.size).toBe(50);
    expect([...ids].every((id) => id.startsWith("w"))).toBe(true);
  });

  it("describes up to four issues with their path, and (raiz) for the root", () => {
    const error = dashboardConfigSchema.safeParse({ filtroGlobal: { turno: 9 }, widgets: [] }).error;
    expect(error).toBeDefined();
    const text = describeZodError(error!);
    expect(text).toContain("filtroGlobal.turno");
    const root = dashboardConfigSchema.safeParse(42).error;
    expect(describeZodError(root!)).toContain("(raiz)");
  });
});

describe("dashboard file import and export", () => {
  beforeEach(() => {
    vi.mocked(downloadJson).mockClear();
  });

  it("reads the full exported format", () => {
    const text = JSON.stringify({
      formato: "eleicoes-dashboard/painel",
      schemaVersion: 1,
      nome: "Exportado",
      config: plainConfig("Exportado"),
    });
    const read = readDashboardFile(text);
    expect(read.name).toBe("Exportado");
    expect(read.config.widgets).toHaveLength(2);
  });

  it("reads a bare config and names it after its own nome, or falls back to a default name", () => {
    expect(readDashboardFile(JSON.stringify(plainConfig("Só config"))).name).toBe("Só config");
    const { nome: _ignored, ...withoutName } = plainConfig();
    expect(readDashboardFile(JSON.stringify(withoutName)).name).toBe("Painel importado");
  });

  it("explains an invalid JSON text and an invalid dashboard shape", () => {
    expect(() => readDashboardFile("{nao é json")).toThrow("O arquivo não é um JSON válido.");
    expect(() => readDashboardFile(JSON.stringify({ schemaVersion: 1, nome: "", config: {} }))).toThrow(
      /Arquivo de painel inválido: .+/,
    );
  });

  it("saves a dashboard in the format the reader accepts, with a slug in the file name", () => {
    downloadDashboardFile("Painel de São Paulo", migrate(plainConfig("Painel de São Paulo"))!);
    expect(downloadJson).toHaveBeenCalledTimes(1);
    const [payload, fileName] = vi.mocked(downloadJson).mock.calls[0];
    expect(fileName).toBe("painel-painel-de-sao-paulo.json");
    expect(payload).toMatchObject({ formato: "eleicoes-dashboard/painel", nome: "Painel de São Paulo" });
    expect(readDashboardFile(JSON.stringify(payload)).name).toBe("Painel de São Paulo");
  });
});
