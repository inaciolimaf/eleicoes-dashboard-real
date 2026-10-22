import { act, fireEvent, screen } from "@testing-library/react";
import { spotlight } from "@mantine/spotlight";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";
import { resetStores } from "./helpers/data-shell";

const PLACEHOLDER = "Buscar município, escola, candidato…";

beforeEach(resetStores);
afterEach(() => {
  vi.useRealTimers();
});

/** Opens the Ctrl+K spotlight; the search box is then the one with the placeholder. */
async function openSpotlight() {
  act(() => spotlight.open());
  return screen.findByPlaceholderText(PLACEHOLDER);
}

describe("shell search", () => {
  it("waits 220 ms after the last keystroke before asking the API", async () => {
    const api = fakeApi({ "GET /search": { items: [] } });
    await renderScreen("/conta");
    const input = await openSpotlight();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    fireEvent.change(input, { target: { value: "s" } });
    fireEvent.change(input, { target: { value: "sp" } });
    await act(() => vi.advanceTimersByTimeAsync(219));
    expect(api.calls("GET /search")).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api.calls("GET /search")).toHaveLength(1);
    expect(api.calls("GET /search")[0]?.query.get("q")).toBe("sp");
  });

  it("does not search for a single letter", async () => {
    const api = fakeApi({ "GET /search": { items: [] } });
    await renderScreen("/conta");
    const input = await openSpotlight();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    fireEvent.change(input, { target: { value: "s" } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(api.calls("GET /search")).toHaveLength(0);
    expect(screen.getByText(/Município, zona/)).toBeInTheDocument();
  });

  it("says nothing was found when the API returns no hit", async () => {
    fakeApi({ "GET /search": { items: [] } });
    await renderScreen("/conta");
    const input = await openSpotlight();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(await screen.findByText("Nada encontrado", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("lists the hits the API found", async () => {
    fakeApi(
      {
        "GET /search": {
          items: [
            {
              type: "municipality",
              id: "3550308",
              title: "São Paulo",
              subtitle: "SP",
              level: "municipality",
            },
            { type: "state", id: "sp", title: "São Paulo (estado)", subtitle: null, level: "state" },
          ],
        },
      },
    );
    await renderScreen("/conta");
    const input = await openSpotlight();
    fireEvent.change(input, { target: { value: "sao" } });
    expect(await screen.findByText("São Paulo", {}, { timeout: 2000 })).toBeInTheDocument();
  });
});

describe("shell search hits", () => {
  it("a candidate hit opens the candidate screen", async () => {
    const hit = {
      type: "candidate",
      id: "280001234567",
      title: "FULANO",
      subtitle: "Presidente",
      office_code: 1,
      state_code: null,
    };
    const api = fakeApi({ "GET /search": { items: [hit] } });
    const { user } = await renderScreen("/conta");
    const input = await openSpotlight();
    await user.type(input, "fulano");
    await user.click(await screen.findByText("FULANO"));
    await vi.waitFor(() => expect(api.calls("GET /candidates/280001234567").length).toBeGreaterThan(0));
  });
});
