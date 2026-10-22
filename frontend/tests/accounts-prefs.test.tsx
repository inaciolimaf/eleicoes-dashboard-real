import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";
import { CANDIDATES, VOTER_USER, resetStores } from "./helpers/data-shell";
import { useAuth } from "../src/lib/auth-store";
import { DEFAULT_PREFS, usePrefs } from "../src/lib/prefs-store";

beforeEach(resetStores);
afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove("sem-animacoes");
});

describe("preferences screen", () => {
  it("changes the theme and the density", async () => {
    fakeApi({});
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByLabelText("Claro"));
    expect(usePrefs.getState().tema).toBe("claro");
    await user.click(screen.getByLabelText("Compacta"));
    expect(usePrefs.getState().densidade).toBe("compacta");
  });

  it("turns the animations off and marks the page", async () => {
    fakeApi({});
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByLabelText(/Animações/));
    expect(usePrefs.getState().animacoes).toBe(false);
    await waitFor(() => expect(document.documentElement.classList.contains("sem-animacoes")).toBe(true));
  });

  it("restores the default preferences", async () => {
    fakeApi({});
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByLabelText("Claro"));
    await user.click(screen.getByRole("button", { name: "Restaurar preferências" }));
    expect(usePrefs.getState().tema).toBe(DEFAULT_PREFS.tema);
  });

  it("lists the candidates of the office with their color", async () => {
    fakeApi({ "GET /candidates": CANDIDATES });
    await renderScreen("/conta");
    expect(await screen.findByText("Ana Lima (13)")).toBeInTheDocument();
    expect(screen.getByText("PT")).toBeInTheDocument();
  });

  it("saves a candidate color chosen in the table", async () => {
    fakeApi({ "GET /candidates": CANDIDATES });
    await renderScreen("/conta");
    const row = (await screen.findByText("Ana Lima (13)")).closest("tr");
    const colorInput = within(row as HTMLElement).getByRole("textbox");
    fireEvent.change(colorInput, { target: { value: "#ff0000" } });
    expect(usePrefs.getState().coresCandidatos["280001"]).toBe("#ff0000");
  });

  it("restores the candidate colors", async () => {
    usePrefs.setState({ coresCandidatos: { "280001": "#ff0000" } });
    fakeApi({ "GET /candidates": CANDIDATES });
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByRole("button", { name: "Restaurar padrão" }));
    expect(usePrefs.getState().coresCandidatos).toEqual({});
  });

  it("asks a visitor to sign in to sync the preferences", async () => {
    fakeApi({});
    await renderScreen("/conta");
    expect(await screen.findByText("Sem login (preferências salvas neste navegador)")).toBeInTheDocument();
  });
});

describe("preferences sync", () => {
  it("loads the account's preferences from the API", async () => {
    useAuth.setState({ token: "token-abc", user: VOTER_USER });
    fakeApi(
      {
        "GET /preferences": {
          theme: "claro",
          density: "compacta",
          animations: true,
          candidate_colors: {},
          notifications: { toasts: [], push: false },
        },
      },
    );
    await renderScreen("/conta");
    await waitFor(() => expect(usePrefs.getState().tema).toBe("claro"));
    expect(usePrefs.getState().densidade).toBe("compacta");
  });
});
