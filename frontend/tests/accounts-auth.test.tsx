import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeApi, problem, renderScreen } from "./helpers/screen";
import { ADMIN_USER, VOTER_USER, resetStores } from "./helpers/data-shell";
import { useAuth } from "../src/lib/auth-store";

const LOGIN_PATH = "POST /auth/login";
const SESSION = { access_token: "token-abc", token_type: "bearer", user: VOTER_USER };

beforeEach(resetStores);

/** Opens the sign-in modal from the "Entrar para sincronizar preferências" button of the preferences screen. */
async function openAuthDialog(user: UserEvent) {
  await user.click(await screen.findByRole("button", { name: "Entrar para sincronizar preferências" }));
  return screen.findByRole("dialog");
}

async function fillLogin(dialog: HTMLElement, user: UserEvent, email: string, password: string) {
  await user.type(within(dialog).getByLabelText("E-mail"), email);
  await user.type(within(dialog).getByLabelText("Senha"), password);
  await user.click(within(dialog).getByRole("button", { name: "Entrar" }));
}

describe("sign-in modal", () => {
  it("shows the API's message when the password is wrong", async () => {
    fakeApi({
      [LOGIN_PATH]: { status: 401, body: problem(401, "e-mail ou senha inválidos") },
    });
    const { user } = await renderScreen("/conta");
    const dialog = await openAuthDialog(user);
    await fillLogin(dialog, user, "eleitor@example.com", "senha-errada");
    expect(await within(dialog).findByText("e-mail ou senha inválidos")).toBeInTheDocument();
    expect(useAuth.getState().token).toBeNull();
  });

  it("asks the user to wait when the API answers 429", async () => {
    fakeApi({
      [LOGIN_PATH]: { status: 429, body: problem(429, "Muitas tentativas de login. Tente de novo em um minuto.") },
    });
    const { user } = await renderScreen("/conta");
    const dialog = await openAuthDialog(user);
    await fillLogin(dialog, user, "eleitor@example.com", "senha-certa");
    expect(
      await within(dialog).findByText("Muitas tentativas de login. Tente de novo em um minuto."),
    ).toBeInTheDocument();
  });

  it("checks the e-mail before sending anything", async () => {
    const api = fakeApi({ [LOGIN_PATH]: SESSION });
    const { user } = await renderScreen("/conta");
    const dialog = await openAuthDialog(user);
    // the browser's own e-mail check accepts "ana@dominio", the screen's rule needs a dot after the @
    await fillLogin(dialog, user, "ana@dominio", "123456");
    expect(await within(dialog).findByText("E-mail inválido")).toBeInTheDocument();
    expect(api.calls(LOGIN_PATH)).toHaveLength(0);
  });

  it("keeps the session and closes when the login succeeds", async () => {
    const api = fakeApi({ [LOGIN_PATH]: SESSION });
    const { user } = await renderScreen("/conta");
    const dialog = await openAuthDialog(user);
    await fillLogin(dialog, user, "eleitor@example.com", "senha-certa");
    await waitFor(() => expect(useAuth.getState().token).toBe("token-abc"));
    expect(api.calls(LOGIN_PATH)[0]?.body).toEqual({ email: "eleitor@example.com", password: "senha-certa" });
    expect(useAuth.getState().user).toEqual(VOTER_USER);
  });

  it("creates an account from the second tab", async () => {
    const api = fakeApi({ "POST /auth/register": SESSION });
    const { user } = await renderScreen("/conta");
    const dialog = await openAuthDialog(user);
    await user.click(within(dialog).getByRole("tab", { name: "Criar conta" }));
    await user.type(within(dialog).getByLabelText("Nome"), "Bruno Eleitor");
    await user.type(within(dialog).getByLabelText("E-mail"), "eleitor@example.com");
    await user.type(within(dialog).getByLabelText("Senha"), "senha-certa");
    await user.click(within(dialog).getByRole("button", { name: "Criar conta" }));
    await waitFor(() => expect(useAuth.getState().token).toBe("token-abc"));
    expect(api.calls("POST /auth/register")[0]?.body).toEqual({
      name: "Bruno Eleitor",
      email: "eleitor@example.com",
      password: "senha-certa",
    });
  });

  it("asks for the name when creating an account", async () => {
    fakeApi({ "POST /auth/register": SESSION });
    const { user } = await renderScreen("/conta");
    const dialog = await openAuthDialog(user);
    await user.click(within(dialog).getByRole("tab", { name: "Criar conta" }));
    await user.type(within(dialog).getByLabelText("E-mail"), "eleitor@example.com");
    await user.type(within(dialog).getByLabelText("Senha"), "senha-certa");
    await user.click(within(dialog).getByRole("button", { name: "Criar conta" }));
    expect(await within(dialog).findByText("Informe seu nome")).toBeInTheDocument();
  });

  it("opens from the header's Entrar button", async () => {
    fakeApi({});
    const { user } = await renderScreen("/conta");
    await user.click((await screen.findAllByRole("button", { name: "Entrar" }))[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("user menu", () => {
  it("lists the account and the admin entry for an administrator", async () => {
    useAuth.setState({ token: "token-abc", user: ADMIN_USER });
    fakeApi({});
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByRole("button", { name: "Menu do usuário" }));
    expect(await screen.findByText("Conta e preferências")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Alertas" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Administração" })).toBeInTheDocument();
    expect(screen.getByText("Ana Admin")).toBeInTheDocument();
  });

  it("does not offer the admin entry to a voter", async () => {
    useAuth.setState({ token: "token-abc", user: VOTER_USER });
    fakeApi({});
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByRole("button", { name: "Menu do usuário" }));
    expect(await screen.findByText("Sair")).toBeInTheDocument();
    expect(screen.queryByText("Administração")).not.toBeInTheDocument();
  });
});
