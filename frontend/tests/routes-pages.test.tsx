import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";

// The map is covered by its own tests; here the routes only need to render.
vi.mock("../src/modules/maps/components/ElectoralMap", () => ({ ElectoralMap: () => null }));

describe("routes", () => {
  it("shows the not-found page for an unknown URL, with a way back home", async () => {
    fakeApi({});
    await renderScreen("/nao-existe");
    expect(await screen.findByText("Esta página não existe.")).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
  });

  it.each([
    ["/candidatos", "candidates list"],
    ["/explorar/uf/sp", "explore by state"],
    ["/mapas", "maps"],
    ["/eventos", "events"],
    ["/alertas", "alerts"],
    ["/conta", "account"],
    ["/paineis", "dashboards"],
    ["/tv", "tv"],
  ])("renders the screen behind %s (%s) without a 404", async (url) => {
    fakeApi({});
    await renderScreen(url);
    expect(document.body.textContent).not.toContain("Esta página não existe.");
  });

  it("renders the place, the section and the candidate routes with their ids", async () => {
    const api = fakeApi({
      "GET /polling-places/L9": {
        id: "L9",
        name: "Local nove",
        sections: [],
        municipality: { id: "1", name: "A" },
        zone: { id: "z", number: 1 },
      },
      "GET /polling-sections/S9": {},
      "GET /candidates/280009": {},
    });
    await renderScreen("/locais/L9");
    await waitFor(() => expect(api.calls("GET /polling-places/L9")).not.toHaveLength(0));
    await renderScreen("/secoes/S9");
    await waitFor(() => expect(api.calls("GET /polling-sections/S9")).not.toHaveLength(0));
    await renderScreen("/candidatos/280009");
    await waitFor(() => expect(api.calls("GET /candidates/280009")).not.toHaveLength(0));
  });
});
