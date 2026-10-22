import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadJson } from "../src/lib/export";
import { useAuth } from "../src/lib/auth-store";
import { useLocalDashboards } from "../src/modules/dashboards/repo";
import { fakeApi, renderScreen } from "./helpers/screen";
import { dashboardDto, plainConfig, sharedDto, storedDashboards } from "./helpers/data-dashboards";

// Widgets render only once their box has a height; jsdom has no layout, so the size is fixed here.
vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return { ...actual, useElementSize: () => ({ ref: () => {}, width: 800, height: 400 }) };
});
vi.mock("../src/lib/export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/export")>()),
  downloadJson: vi.fn(),
  exportData: vi.fn(),
  exportarPng: vi.fn(),
}));

const STORAGE_KEY = "eleicoes.paineis";

/** Seeds the browser copy of the dashboards before the screen opens (as a returning user has it). */
function seedLocal(list: Parameters<typeof storedDashboards>[0]) {
  // clear the store first: its own writes would otherwise overwrite the seed
  useLocalDashboards.setState({ dashboards: [] });
  localStorage.setItem(STORAGE_KEY, storedDashboards(list));
  return useLocalDashboards.persist.rehydrate();
}

function logIn() {
  useAuth.setState({
    token: "token-de-teste",
    user: { id: "u1", email: "eu@exemplo.org", name: "Eu", is_admin: false } as never,
  });
}

const NativeRequest = globalThis.Request;

beforeEach(() => {
  localStorage.clear();
  useLocalDashboards.setState({ dashboards: [] });
  useAuth.setState({ token: null, user: null });
  vi.mocked(downloadJson).mockClear();
  // jsdom's AbortSignal is not the one undici checks: router navigations would throw while building
  // their Request. Navigation is not aborted in these tests, so the signal is dropped.
  vi.stubGlobal(
    "Request",
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init?.signal ? { ...init, signal: undefined } : init);
      }
    },
  );
});

describe("home screen", () => {
  it("offers the election-night template when the user has no dashboards, and personalizes it into one", async () => {
    const api = fakeApi({});
    const { user } = await renderScreen("/");
    expect(await screen.findByText(/Este é o template/)).toBeInTheDocument();
    expect(screen.getByText("Placar de candidatos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Personalizar", hidden: true }));
    expect(
      await screen.findByRole("heading", { name: "Noite da eleição", hidden: true }),
    ).toBeInTheDocument();
    expect(api.calls("GET /dashboards")).toHaveLength(0);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored.state.paineis).toHaveLength(1);
    expect(stored.state.paineis[0].nome).toBe("Noite da eleição");
  });

  it("opens the template gallery from the starter", async () => {
    const { user } = await renderScreen("/");
    await user.click(await screen.findByRole("button", { name: "Outros templates", hidden: true }));
    expect(await screen.findByText("Painel em branco")).toBeInTheDocument();
    expect(screen.getByText("Câmara dos Deputados")).toBeInTheDocument();
  });

  it("shows the user's default dashboard, and the first one when none is default", async () => {
    await seedLocal([
      { id: "a", nome: "Primeiro" },
      { id: "b", nome: "Padrão", padrao: true },
    ]);
    await renderScreen("/");
    expect(await screen.findByRole("heading", { name: "Padrão", hidden: true })).toBeInTheDocument();
  });

  it("opens the first dashboard when none is the default", async () => {
    await seedLocal([{ id: "a", nome: "Primeiro" }]);
    await renderScreen("/");
    expect(await screen.findByRole("heading", { name: "Primeiro", hidden: true })).toBeInTheDocument();
  });
});

describe("dashboards list", () => {
  it("lists the browser's dashboards and explains they are kept only in this browser", async () => {
    await seedLocal([
      { id: "a", nome: "Eleição A", padrao: true },
      { id: "b", nome: "Eleição B", ordem: 1 },
    ]);
    await renderScreen("/paineis");
    expect(await screen.findByRole("heading", { name: "Meus painéis", hidden: true })).toBeInTheDocument();
    expect(screen.getByText(/Sem login, os painéis ficam salvos neste navegador/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Eleição A", hidden: true })[0]).toHaveAttribute(
      "href",
      "/paineis/a",
    );
    expect(screen.getAllByRole("link", { name: "Abrir", hidden: true })).toHaveLength(2);
  });

  it("invites the first dashboard when the list is empty", async () => {
    await renderScreen("/paineis");
    expect(await screen.findByText("Você ainda não tem painéis.")).toBeInTheDocument();
  });

  it("makes another dashboard the default from the card menu", async () => {
    await seedLocal([
      { id: "a", nome: "Eleição A", padrao: true },
      { id: "b", nome: "Eleição B", ordem: 1 },
    ]);
    const { user } = await renderScreen("/paineis");
    const cards = await screen.findAllByRole("button", { name: "Opções", hidden: true });
    await user.click(cards[1]);
    await user.click(await screen.findByRole("menuitem", { name: "Definir como padrão", hidden: true }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      expect(stored.state.paineis.find((p: { id: string }) => p.id === "b").padrao).toBe(true);
    });
  });

  it("moves a dashboard down and saves the new order", async () => {
    await seedLocal([
      { id: "a", nome: "Eleição A" },
      { id: "b", nome: "Eleição B", ordem: 1 },
    ]);
    const { user } = await renderScreen("/paineis");
    await user.click((await screen.findAllByRole("button", { name: "Mover para baixo", hidden: true }))[0]);
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      const byId = Object.fromEntries(
        stored.state.paineis.map((p: { id: string; ordem: number }) => [p.id, p.ordem]),
      );
      expect(byId.b).toBeLessThan(byId.a);
    });
  });

  it("exports a dashboard as a JSON file", async () => {
    await seedLocal([{ id: "a", nome: "Eleição A" }]);
    const { user } = await renderScreen("/paineis");
    await user.click(await screen.findByRole("button", { name: "Opções", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Exportar JSON", hidden: true }));
    expect(downloadJson).toHaveBeenCalledWith(
      expect.objectContaining({ formato: "eleicoes-dashboard/painel", nome: "Eleição A" }),
      "painel-eleicao-a.json",
    );
  });

  it("deletes a dashboard after the user confirms", async () => {
    await seedLocal([{ id: "a", nome: "Eleição A" }]);
    const { user } = await renderScreen("/paineis");
    await user.click(await screen.findByRole("button", { name: "Opções", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Apagar", hidden: true }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Apagar", hidden: true }));
    await waitFor(() => expect(screen.getByText("Você ainda não tem painéis.")).toBeInTheDocument());
  });

  it("duplicates a dashboard as a copy and opens it", async () => {
    await seedLocal([{ id: "a", nome: "Eleição A" }]);
    const { user } = await renderScreen("/paineis");
    await user.click(await screen.findByRole("button", { name: "Opções", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicar", hidden: true }));
    expect(
      await screen.findByRole("heading", { name: "Eleição A (cópia)", hidden: true }),
    ).toBeInTheDocument();
  });

  it("creates a blank dashboard from the new-dashboard dialog and opens it empty", async () => {
    const { user } = await renderScreen("/paineis");
    await user.click(await screen.findByRole("button", { name: "Novo painel", hidden: true }));
    await user.click(await screen.findByText("Painel em branco"));
    await user.click(screen.getByRole("button", { name: "Criar painel", hidden: true }));
    expect(await screen.findByText("Painel vazio")).toBeInTheDocument();
    expect(useLocalDashboards.getState().dashboards[0].name).toBe("Painel em branco");
  });

  it("asks for the area a template needs before it creates the dashboard", async () => {
    const { user } = await renderScreen("/paineis");
    await user.click(await screen.findByRole("button", { name: "Novo painel", hidden: true }));
    await user.click(await screen.findByText("Meu estado"));
    await user.click(screen.getByRole("button", { name: "Criar painel", hidden: true }));
    expect(await screen.findByText("Escolha o recorte para este template.")).toBeInTheDocument();
  });

  it("imports a dashboard file into the list", async () => {
    const { container } = await renderScreen("/paineis");
    const input = await waitFor(() => {
      const found = container.querySelector<HTMLInputElement>('input[type="file"]');
      if (!found) throw new Error("file input not rendered yet");
      return found;
    });
    const file = new File(
      [
        JSON.stringify({
          formato: "eleicoes-dashboard/painel",
          schemaVersion: 1,
          nome: "Importado",
          config: plainConfig("Importado"),
        }),
      ],
      "painel.json",
      { type: "application/json" },
    );
    fireEvent.change(input, { target: { files: [file] } });
    expect((await screen.findAllByText("Importado")).length).toBeGreaterThan(0);
  });

  it("shows the browser dashboards pending a move to the account, once logged in", async () => {
    logIn();
    await seedLocal([{ id: "a", nome: "Só aqui" }]);
    fakeApi({ "GET /dashboards": [dashboardDto({ id: "r1", name: "Da conta" })] });
    await renderScreen("/paineis");
    expect((await screen.findAllByRole("link", { name: "Da conta", hidden: true })).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/Há 1 painel\(is\) salvo\(s\) só neste navegador/)).toBeInTheDocument();
    expect(screen.queryByText(/Sem login/)).not.toBeInTheDocument();
  });

  it("sends the browser dashboards to the account", async () => {
    logIn();
    await seedLocal([{ id: "a", nome: "Só aqui" }]);
    const api = fakeApi({
      "GET /dashboards": [],
      "POST /dashboards": (call: { body: unknown }) => ({ ...dashboardDto({ id: "n1" }), body: call.body }),
    });
    const { user } = await renderScreen("/paineis");
    await user.click(
      await screen.findByRole("button", { name: "Enviar painéis locais para a conta", hidden: true }),
    );
    await waitFor(() => expect(api.calls("POST /dashboards")).toHaveLength(1));
    expect(api.calls("POST /dashboards")[0].body).toMatchObject({ name: "Só aqui", is_default: false });
  });
});

describe("dashboard screen (one dashboard)", () => {
  it("opens a dashboard from the browser copy with its widgets", async () => {
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    await renderScreen("/paineis/a");
    expect(await screen.findByRole("heading", { name: "Minha eleição", hidden: true })).toBeInTheDocument();
    expect(screen.getByText("neste navegador")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anotação", hidden: true })).toBeInTheDocument();
    expect(screen.getByText("Agora")).toBeInTheDocument();
  });

  it("shows the title typed for a widget in its settings", async () => {
    await seedLocal([
      {
        id: "a",
        nome: "Minha eleição",
        config: {
          ...plainConfig("Minha eleição"),
          widgets: [
            {
              id: "w1",
              tipo: "relogio",
              pos: { x: 0, y: 0, w: 4, h: 4 },
              herda: true,
              config: { modo: "relogio", rotulo: "Agora", titulo: "Hora da apuração" },
            },
          ],
        },
      },
    ]);
    await renderScreen("/paineis/a");
    expect(await screen.findByText("Hora da apuração")).toBeInTheDocument();
  });

  it("says when the dashboard does not exist", async () => {
    await renderScreen("/paineis/nao-existe");
    expect(await screen.findByText("Painel não encontrado")).toBeInTheDocument();
  });

  it("edits the widgets: adds a widget from the catalog, then undoes it", async () => {
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    const { user } = await renderScreen("/paineis/a");
    await user.click(await screen.findByRole("button", { name: "Editar painel", hidden: true }));
    await user.click(screen.getByRole("button", { name: "Adicionar widget", hidden: true }));
    await user.type(await screen.findByPlaceholderText("Buscar no catálogo…"), "totais");
    await user.click(await screen.findByText("Bloco de totais"));
    await user.click(screen.getByRole("button", { name: "Adicionar", hidden: true }));
    expect(await screen.findByText(/Bloco de totais adicionado ao fim do painel/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Desfazer", hidden: true })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Desfazer", hidden: true }));
    await user.click(screen.getByRole("button", { name: "Refazer", hidden: true }));
    await user.click(screen.getByRole("button", { name: "Concluir", hidden: true }));
    expect(screen.getByRole("button", { name: "Editar painel", hidden: true })).toBeInTheDocument();
  });

  it("configures a widget: fixes its filter and applies the change", async () => {
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    const { user } = await renderScreen("/paineis/a");
    await user.click(await screen.findByRole("button", { name: "Editar painel", hidden: true }));
    const [menu] = await screen.findAllByRole("button", { name: "Opções do widget", hidden: true });
    await user.click(menu);
    await user.click(await screen.findByRole("menuitem", { name: "Configurar", hidden: true }));
    expect(await screen.findByText("Configurar · Texto / anotação")).toBeInTheDocument();
    await user.click(screen.getByText("Fixar"));
    expect(screen.getByText("Congelar no tempo")).toBeInTheDocument();
    await user.click(screen.getByText("Congelar no tempo"));
    expect(await screen.findByText("Instante (horário de Brasília)")).toBeInTheDocument();
    await user.click(screen.getAllByText("Ao vivo")[0]);
    await user.click(screen.getByRole("button", { name: "Aplicar", hidden: true }));
    expect(await screen.findByRole("button", { name: "Concluir", hidden: true })).toBeInTheDocument();
  });

  it("duplicates and removes a widget while editing", async () => {
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    const { user } = await renderScreen("/paineis/a");
    await user.click(await screen.findByRole("button", { name: "Editar painel", hidden: true }));
    const [menu] = await screen.findAllByRole("button", { name: "Opções do widget", hidden: true });
    await user.click(menu);
    await user.click(await screen.findByRole("menuitem", { name: "Duplicar", hidden: true }));
    await waitFor(() =>
      expect(screen.getAllByRole("heading", { name: "Anotação", hidden: true })).toHaveLength(2),
    );

    const menus = await screen.findAllByRole("button", { name: "Opções do widget", hidden: true });
    await user.click(menus[0]);
    await user.click(await screen.findByRole("menuitem", { name: "Remover", hidden: true }));
    await waitFor(() =>
      expect(screen.getAllByRole("heading", { name: "Anotação", hidden: true })).toHaveLength(1),
    );
  });

  it("renames the dashboard from the menu", async () => {
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    const { user } = await renderScreen("/paineis/a");
    await user.click(await screen.findByRole("button", { name: "Menu do painel", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Renomear", hidden: true }));
    const dialog = await screen.findByRole("dialog");
    const field = within(dialog).getByRole("textbox");
    await user.clear(field);
    await user.type(field, "Nova eleição");
    await user.click(within(dialog).getByRole("button", { name: "Salvar", hidden: true }));
    expect(await screen.findByRole("heading", { name: "Nova eleição", hidden: true })).toBeInTheDocument();
  });

  it("explains how to share a dashboard that is still only in the browser", async () => {
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    const { user } = await renderScreen("/paineis/a");
    await user.click(await screen.findByRole("button", { name: "Menu do painel", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Compartilhar…", hidden: true }));
    expect(await screen.findByText(/Para gerar um link público/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Entrar", hidden: true }).length).toBeGreaterThan(0);
  });

  it("creates a public link for a dashboard saved in the account", async () => {
    logIn();
    const api = fakeApi({
      "GET /dashboards": [dashboardDto({ id: "d1", name: "Da conta" })],
      "POST /dashboards/d1/shares": { token: "abc123", url: "/p/abc123" },
    });
    const { user } = await renderScreen("/paineis/d1");
    await user.click(await screen.findByRole("button", { name: "Menu do painel", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Compartilhar…", hidden: true }));
    await user.click(await screen.findByRole("button", { name: "Gerar link", hidden: true }));
    expect(await screen.findByDisplayValue(/\/p\/abc123$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar", hidden: true })).toBeInTheDocument();
    expect(api.calls("POST /dashboards/d1/shares")[0].body).toEqual({ mode: "live", frozen_time: null });
  });

  it("shows the error the server gives when the share cannot be created", async () => {
    logIn();
    fakeApi({
      "GET /dashboards": [dashboardDto({ id: "d1", name: "Da conta" })],
      "POST /dashboards/d1/shares": () => {
        throw new Error("sem permissão");
      },
    });
    const { user } = await renderScreen("/paineis/d1");
    await user.click(await screen.findByRole("button", { name: "Menu do painel", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Compartilhar…", hidden: true }));
    await user.click(await screen.findByRole("button", { name: "Gerar link", hidden: true }));
    // the share is not created, so no link input appears
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Gerar link", hidden: true })).toBeEnabled(),
    );
    expect(screen.queryByDisplayValue(/\/p\//)).not.toBeInTheDocument();
  });

  it("opens the TV mode for the dashboard", async () => {
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    const { user } = await renderScreen("/paineis/a");
    await user.click(await screen.findByRole("button", { name: "Menu do painel", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Modo TV", hidden: true }));
    expect(await screen.findByRole("button", { name: "Sair do modo TV", hidden: true })).toBeInTheDocument();
  });

  it("deletes the dashboard from its menu and returns to the list", async () => {
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    const { user } = await renderScreen("/paineis/a");
    await user.click(await screen.findByRole("button", { name: "Menu do painel", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Apagar painel", hidden: true }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Apagar", hidden: true }));
    expect(await screen.findByText("Você ainda não tem painéis.")).toBeInTheDocument();
  });

  it("shows the empty state of a dashboard without widgets, with a way to add one", async () => {
    await seedLocal([{ id: "a", nome: "Vazio", config: { ...plainConfig("Vazio"), widgets: [] } }]);
    const { user } = await renderScreen("/paineis/a");
    expect(await screen.findByText("Painel vazio")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adicionar widget", hidden: true }));
    expect(await screen.findByPlaceholderText("Buscar no catálogo…")).toBeInTheDocument();
  });

  it("exports the open dashboard as JSON", async () => {
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    const { user } = await renderScreen("/paineis/a");
    await user.click(await screen.findByRole("button", { name: "Menu do painel", hidden: true }));
    await user.click(await screen.findByRole("menuitem", { name: "Exportar JSON", hidden: true }));
    expect(downloadJson).toHaveBeenCalledWith(expect.anything(), "painel-minha-eleicao.json");
  });

  it("saves the edited dashboard a moment after the last change", async () => {
    // the drawer opens on real timers (its transition needs them); only the save delay is faked
    await seedLocal([{ id: "a", nome: "Minha eleição", config: plainConfig("Minha eleição") }]);
    const { user } = await renderScreen("/paineis/a");
    await user.click(await screen.findByRole("button", { name: "Editar painel", hidden: true }));
    await user.click(screen.getByRole("button", { name: "Adicionar widget", hidden: true }));
    const addButton = await screen.findByRole("button", { name: "Adicionar", hidden: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(addButton);
      await act(async () => {
        vi.advanceTimersByTime(900);
      });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      expect(stored.state.paineis[0].config.widgets).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TV screen", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  it("rotates between the dashboards and pauses on request", async () => {
    await seedLocal([
      { id: "a", nome: "Primeiro", ordem: 0 },
      { id: "b", nome: "Segundo", ordem: 1 },
    ]);
    try {
      const { user } = await renderScreen("/tv");
      expect(await screen.findByRole("heading", { name: "Primeiro", hidden: true })).toBeInTheDocument();
      expect(screen.getByText("1/2")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(await screen.findByRole("heading", { name: "Segundo", hidden: true })).toBeInTheDocument();
      expect(screen.getByText("2/2")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Pausar rotação", hidden: true }));
      act(() => {
        vi.advanceTimersByTime(120_000);
      });
      expect(screen.getByRole("heading", { name: "Segundo", hidden: true })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Retomar rotação", hidden: true }));
      await user.click(screen.getByRole("button", { name: "Painel anterior", hidden: true }));
      expect(await screen.findByRole("heading", { name: "Primeiro", hidden: true })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Próximo painel", hidden: true }));
      await user.click(screen.getByText("120s"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts on the dashboard named in the link", async () => {
    await seedLocal([
      { id: "a", nome: "Primeiro", ordem: 0 },
      { id: "b", nome: "Segundo", ordem: 1 },
    ]);
    try {
      await renderScreen("/tv?inicio=b");
      expect(await screen.findByRole("heading", { name: "Segundo", hidden: true })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the election night when there are no dashboards", async () => {
    try {
      await renderScreen("/tv");
      expect(
        await screen.findByRole("heading", { name: "Noite da eleição", hidden: true }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("shared screen (/p/:token)", () => {
  it("shows a live shared dashboard, read-only", async () => {
    fakeApi({
      "GET /shared/tok1": sharedDto({
        dashboard: dashboardDto({ name: "Compartilhado ao vivo" }),
      }),
    });
    await renderScreen("/p/tok1");
    expect(
      await screen.findByRole("heading", { name: "Compartilhado ao vivo", hidden: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("somente leitura")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anotação", hidden: true })).toBeInTheDocument();
  });

  it("shows a frozen share with the moment it is frozen at", async () => {
    fakeApi({
      "GET /shared/tok2": sharedDto({
        mode: "frozen",
        frozen_time: "2026-10-04T20:00:00Z",
        dashboard: dashboardDto({ name: "Congelado" }),
      }),
    });
    await renderScreen("/p/tok2");
    expect(await screen.findByText(/congelado em/)).toBeInTheDocument();
    expect(screen.queryByText("Abrir o app", { exact: false })).toBeInTheDocument();
  });

  it("explains the share is empty", async () => {
    fakeApi({
      "GET /shared/tok3": sharedDto({
        dashboard: dashboardDto({ name: "Vazio", config: { ...plainConfig(), widgets: [] } }),
      }),
    });
    await renderScreen("/p/tok3");
    expect(await screen.findByText("Este painel está vazio.")).toBeInTheDocument();
  });

  it("reports a share that does not exist or expired", async () => {
    fakeApi({});
    await renderScreen("/p/nao-existe");
    expect(await screen.findByText("somente leitura")).toBeInTheDocument();
  });
});
