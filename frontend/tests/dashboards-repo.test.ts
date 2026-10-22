import { beforeEach, describe, expect, it } from "vitest";
import { dashboardDto, plainConfig, storedDashboards } from "./helpers/data-dashboards";
import { useEditor } from "../src/modules/dashboards/editor";
import { toDashboard, useBrowserDashboards, type Dashboard } from "../src/modules/dashboards/repo";
import { TEMPLATES, defaultTemplate } from "../src/modules/dashboards/templates";
import { migrate } from "../src/modules/dashboards/schema";

const STORAGE_KEY = "eleicoes.paineis";

/** The typed config a screen would hold: the schema applied to the fixture. */
const cfg = (name: string) => migrate(plainConfig(name))!;

function browserDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: "local-1",
    name: "Local um",
    position: 0,
    isDefault: false,
    config: migrate(plainConfig("Local um"))!,
    updatedAt: "2026-10-22T12:00:00.000Z",
    remote: false,
    ...overrides,
  };
}

describe("local dashboards (browser copy)", () => {
  beforeEach(() => {
    localStorage.clear();
    useBrowserDashboards.setState({ dashboards: [] });
  });

  it("writes the browser copy with the Portuguese keys the app always used", () => {
    useBrowserDashboards
      .getState()
      .setDashboards(() => [browserDashboard({ name: "Gravado", isDefault: true })]);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored.version).toBe(1);
    expect(stored.state.paineis).toHaveLength(1);
    expect(stored.state.paineis[0]).toMatchObject({
      id: "local-1",
      nome: "Gravado",
      ordem: 0,
      padrao: true,
      remoto: false,
      atualizado_em: "2026-10-22T12:00:00.000Z",
    });
    expect(stored.state.paineis[0].config.widgets).toHaveLength(2);
  });

  it("reads back what was saved before the rename, and normalizes its level vocabulary", async () => {
    const oldConfig = {
      ...plainConfig("Antigo"),
      filtroGlobal: { ...plainConfig().filtroGlobal, nivel: "uf" },
    };
    localStorage.setItem(
      STORAGE_KEY,
      storedDashboards([{ id: "a", nome: "Antigo", padrao: true, config: oldConfig }]),
    );
    await useBrowserDashboards.persist.rehydrate();
    const [restored] = useBrowserDashboards.getState().dashboards;
    expect(restored).toMatchObject({ id: "a", name: "Antigo", isDefault: true, remote: false });
    expect(restored.config.filtroGlobal.nivel).toBe("state");
  });

  it("keeps a stored dashboard whose config no longer matches (it is shown as it was saved)", async () => {
    const broken = { widgets: "quebrado" };
    localStorage.setItem(STORAGE_KEY, storedDashboards([{ id: "b", nome: "Quebrado", config: broken }]));
    await useBrowserDashboards.persist.rehydrate();
    const [restored] = useBrowserDashboards.getState().dashboards;
    expect(restored.name).toBe("Quebrado");
    expect(restored.config).toEqual(broken);
  });
});

describe("toDashboard (account copy)", () => {
  it("maps the API fields to the screen fields", () => {
    const dashboard = toDashboard(
      dashboardDto({ id: 7 as unknown as string, is_default: true, position: 3 }),
    );
    expect(dashboard).toMatchObject({
      id: "7",
      name: "Painel um",
      position: 3,
      isDefault: true,
      remote: true,
    });
    expect(dashboard.config.widgets).toHaveLength(2);
  });

  it("falls back to the default template when the stored config is invalid", () => {
    const dashboard = toDashboard(dashboardDto({ config: { widgets: "quebrado" }, updated_at: null }));
    expect(dashboard.config).toEqual(defaultTemplate());
    expect(dashboard.updatedAt).toBe("");
    expect(dashboard.position).toBe(0);
  });
});

describe("editor (undo/redo of the dashboard being edited)", () => {
  beforeEach(() => {
    useEditor.getState().reset();
  });

  it("loads a dashboard once and applies changes with history", () => {
    const editor = useEditor.getState();
    editor.load("d1", cfg("A"));
    useEditor.getState().apply((c) => ({ ...c, nome: "B" }));
    expect(useEditor.getState().config?.nome).toBe("B");
    expect(useEditor.getState().past).toHaveLength(1);
    expect(useEditor.getState().version).toBe(1);

    useEditor.getState().load("d1", cfg("ignorado"));
    expect(useEditor.getState().config?.nome).toBe("B");
  });

  it("undoes and redoes, and a new change clears the redo history", () => {
    useEditor.getState().load("d1", cfg("A"));
    useEditor.getState().apply((c) => ({ ...c, nome: "B" }));
    useEditor.getState().apply((c) => ({ ...c, nome: "C" }));
    useEditor.getState().undo();
    expect(useEditor.getState().config?.nome).toBe("B");
    useEditor.getState().redo();
    expect(useEditor.getState().config?.nome).toBe("C");
    useEditor.getState().undo();
    useEditor.getState().apply((c) => ({ ...c, nome: "D" }));
    expect(useEditor.getState().future).toHaveLength(0);
  });

  it("does nothing to undo or redo with an empty history, and to a change that returns the same object", () => {
    useEditor.getState().load("d1", cfg("A"));
    const before = useEditor.getState();
    useEditor.getState().undo();
    useEditor.getState().redo();
    useEditor.getState().apply((c) => c);
    expect(useEditor.getState().version).toBe(before.version);
    expect(useEditor.getState().config).toBe(before.config);
  });

  it("keeps the history bounded and skips history or the save flag on request", () => {
    useEditor.getState().load("d1", cfg("A"));
    for (let i = 0; i < 70; i++) useEditor.getState().apply((c) => ({ ...c, nome: `N${i}` }));
    expect(useEditor.getState().past).toHaveLength(60);

    const version = useEditor.getState().version;
    useEditor.getState().apply((c) => ({ ...c, nome: "sem histórico" }), { history: false, save: false });
    expect(useEditor.getState().past).toHaveLength(60);
    expect(useEditor.getState().version).toBe(version);
    expect(useEditor.getState().config?.nome).toBe("sem histórico");
  });

  it("toggles the editing flag and resets everything", () => {
    useEditor.getState().load("d1", cfg("A"));
    useEditor.getState().setEditing(true);
    expect(useEditor.getState().editing).toBe(true);
    useEditor.getState().reset();
    expect(useEditor.getState()).toMatchObject({ dashboardId: null, config: null, past: [], version: 0 });
  });
});

describe("templates", () => {
  it("every template builds a config that matches the schema", () => {
    for (const template of TEMPLATES) {
      const config = template.create({});
      expect(migrate(config), template.id).not.toBeNull();
      expect(config.widgets.length, template.id).toBeGreaterThan(0);
    }
  });

  it("uses the chosen area and name, with defaults when nothing is chosen", () => {
    const state = TEMPLATES.find((t) => t.id === "meu-estado")!;
    expect(state.needs).toBe("state");
    expect(state.create({}).nome).toBe("Meu estado");
    const named = state.create({ areaId: "mg", name: "Minas" });
    expect(named.nome).toBe("Meu estado – Minas");
    expect(named.filtroGlobal.recorte).toBe("mg");
    expect(named.widgets.find((w) => w.id === "w3")?.filtros?.recorte).toBe("mg");
  });

  it("the election night template follows the chosen round", () => {
    const night = TEMPLATES.find((t) => t.id === "noite-eleicao")!;
    expect(night.create({ round: 2 }).filtroGlobal.turno).toBe(2);
    expect(defaultTemplate()).toEqual(night.create({}));
  });

  it("the city and college templates take their own default areas", () => {
    const city = TEMPLATES.find((t) => t.id === "minha-cidade")!.create({});
    expect(city.filtroGlobal.recorte).toBe("sp71072");
    const college = TEMPLATES.find((t) => t.id === "meu-colegio")!.create({ name: "Escola" });
    expect(college.nome).toBe("Meu colégio – Escola");
    expect(college.widgets[0].config.localId).toBe("sp71072-z0001-l1015");
  });
});
