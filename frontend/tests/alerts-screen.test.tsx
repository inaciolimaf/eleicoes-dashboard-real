import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, problem, renderScreen } from "./helpers/screen";
import {
  ALERT_RULE,
  CANDIDATES,
  VOTER_USER,
  resetStores,
  } from "./helpers/data-shell";
import { useAuth } from "../src/lib/auth-store";
import { usePrefs } from "../src/lib/prefs-store";

beforeEach(() => {
  resetStores();
});

/** Makes the browser's Notification API available with a given permission. */
function stubNotification(permission: NotificationPermission, answer: NotificationPermission = permission) {
  const requestPermission = vi.fn(async () => answer);
  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermission;
    constructor(
      readonly title: string,
      readonly options?: NotificationOptions,
    ) {}
  }
  vi.stubGlobal("Notification", FakeNotification);
  return requestPermission;
}

describe("alerts screen, visitor", () => {
  it("asks the visitor to sign in before creating a rule", async () => {
    fakeApi({});
    await renderScreen("/alertas");
    expect(await screen.findByText("Entre para criar alertas")).toBeInTheDocument();
    expect(screen.queryByText("Novo alerta")).not.toBeInTheDocument();
  });

  it("opens the sign-in modal from the prompt", async () => {
    fakeApi({});
    const { user } = await renderScreen("/alertas");
    await user.click((await screen.findAllByRole("button", { name: "Entrar" }))[0] as HTMLElement);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("alerts screen, account", () => {
  beforeEach(() => {
    useAuth.setState({ token: "token-abc", user: VOTER_USER });
  });

  it("lists the account's rules in words", async () => {
    fakeApi({ "GET /alerts": [ALERT_RULE] });
    await renderScreen("/alertas");
    expect(await screen.findByText(/Candidato 280001 passar de 50%/)).toBeInTheDocument();
    expect(screen.getAllByText("Quando um candidato passar de X%").length).toBeGreaterThan(0);
  });

  it("explains when there are no rules yet", async () => {
    fakeApi({});
    await renderScreen("/alertas");
    expect(await screen.findByText("Nenhum alerta")).toBeInTheDocument();
  });

  it("switches a rule off and saves it", async () => {
    const api = fakeApi({ "GET /alerts": [ALERT_RULE], "PUT /alerts/alert-1": ALERT_RULE });
    const { user } = await renderScreen("/alertas");
    await user.click(await screen.findByRole("switch", { name: "Ativo" }));
    await waitFor(() => expect(api.calls("PUT /alerts/alert-1")).toHaveLength(1));
    expect(api.calls("PUT /alerts/alert-1")[0]?.body).toEqual({
      type: "candidate_pct",
      params: ALERT_RULE.params,
      active: false,
    });
  });

  it("deletes a rule", async () => {
    const api = fakeApi({ "GET /alerts": [ALERT_RULE], "DELETE /alerts/alert-1": null });
    const { user } = await renderScreen("/alertas");
    await user.click(await screen.findByRole("button", { name: "Apagar alerta" }));
    await waitFor(() => expect(api.calls("DELETE /alerts/alert-1")).toHaveLength(1));
  });

  it("creates a candidate rule from the filled form", async () => {
    const api = fakeApi({ "GET /candidates": CANDIDATES, "POST /alerts": ALERT_RULE });
    const { user } = await renderScreen("/alertas");
    await user.click(await screen.findByRole("textbox", { name: "Candidato" }));
    await user.click(await screen.findByRole("option", { name: /Ana Lima/ }));
    const limit = screen.getByRole("textbox", { name: "Limite (%)" });
    await user.tripleClick(limit);
    await user.keyboard("60");
    await user.click(screen.getByRole("button", { name: "Criar alerta" }));
    await waitFor(() => expect(api.calls("POST /alerts")).toHaveLength(1));
    expect(api.calls("POST /alerts")[0]?.body).toEqual({
      type: "candidate_pct",
      params: {
        office_code: 1,
        level: "country",
        geo_area_id: "br",
        tse_candidate_id: "280001",
        threshold: 60,
      },
      active: true,
    });
  });

  it("does not send a rule with an empty field", async () => {
    const api = fakeApi({ "POST /alerts": ALERT_RULE });
    const { user } = await renderScreen("/alertas");
    await user.click(await screen.findByRole("textbox", { name: "Regra" }));
    await user.click(await screen.findByRole("option", { name: "Quando um local de votação for apurado" }));
    await user.click(screen.getByRole("button", { name: "Criar alerta" }));
    expect(await screen.findByText("Preencha todos os campos do alerta.")).toBeInTheDocument();
    expect(api.calls("POST /alerts")).toHaveLength(0);
  });

  it("shows the API's reason when the rule cannot be saved", async () => {
    fakeApi({ "GET /candidates": CANDIDATES,
      ["POST /alerts"]: { status: 422, body: problem(422, "limite fora da faixa") },
    });
    const { user } = await renderScreen("/alertas");
    await user.click(await screen.findByRole("textbox", { name: "Candidato" }));
    await user.click(await screen.findByRole("option", { name: /Ana Lima/ }));
    await user.click(screen.getByRole("button", { name: "Criar alerta" }));
    expect(await screen.findByText("limite fora da faixa")).toBeInTheDocument();
  });
});

describe("push notifications card", () => {
  it("asks the browser for permission and turns push on when granted", async () => {
    const request = stubNotification("default", "granted");
    fakeApi({});
    const { user } = await renderScreen("/alertas");
    await user.click(await screen.findByRole("button", { name: "Permitir notificações" }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(usePrefs.getState().push).toBe(true);
  });

  it("says push is blocked when the browser refused it", async () => {
    stubNotification("denied");
    fakeApi({});
    await renderScreen("/alertas");
    expect(await screen.findByRole("button", { name: "Bloqueado no navegador" })).toBeDisabled();
  });

  it("offers a switch once permission is granted", async () => {
    stubNotification("granted");
    fakeApi({});
    const { user } = await renderScreen("/alertas");
    await user.click(await screen.findByRole("switch", { name: "Ativo" }));
    expect(usePrefs.getState().push).toBe(true);
  });
});
