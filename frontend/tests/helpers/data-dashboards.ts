import type { DashboardDto, SharedDashboardDto } from "../../src/api/models";

/** Config with two widgets that call no API (a note and a clock), for screen tests. */
export function plainConfig(name = "Meu painel") {
  return {
    schemaVersion: 1,
    nome: name,
    filtroGlobal: {
      ambiente: "oficial",
      ciclo: "ele2026",
      turno: 1,
      cargo: 1,
      nivel: "country",
      recorte: "br",
      tempo: "agora",
    },
    widgets: [
      {
        id: "w1",
        tipo: "texto",
        pos: { x: 0, y: 0, w: 4, h: 4 },
        herda: true,
        config: { texto: "## Anotação\n- item **forte**" },
      },
      {
        id: "w2",
        tipo: "relogio",
        pos: { x: 4, y: 0, w: 3, h: 4 },
        herda: true,
        config: { modo: "relogio", rotulo: "Agora" },
      },
    ],
  };
}

export function dashboardDto(overrides: Partial<DashboardDto> = {}): DashboardDto {
  return {
    id: "d1",
    name: "Painel um",
    position: 0,
    is_default: false,
    schema_version: 1,
    config: plainConfig(),
    updated_at: "2026-10-22T12:00:00Z",
    ...overrides,
  };
}

export function sharedDto(overrides: Partial<SharedDashboardDto> = {}): SharedDashboardDto {
  return {
    dashboard: dashboardDto({ name: "Painel compartilhado" }),
    mode: "live",
    frozen_time: null,
    ...overrides,
  };
}

/** The `localStorage` value the app wrote before the English rename: Portuguese keys, version 1. */
export function storedDashboards(
  list: { id: string; nome: string; padrao?: boolean; ordem?: number; config?: unknown }[],
): string {
  return JSON.stringify({
    state: {
      paineis: list.map((item) => ({
        id: item.id,
        nome: item.nome,
        ordem: item.ordem ?? 0,
        padrao: item.padrao ?? false,
        config: item.config ?? plainConfig(item.nome),
        atualizado_em: "2026-10-22T12:00:00.000Z",
        remoto: false,
      })),
    },
    version: 1,
  });
}
