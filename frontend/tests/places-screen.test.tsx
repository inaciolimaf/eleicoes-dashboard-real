import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";

// The electoral map is covered by its own tests: here the detail only needs a stand-in for it.
vi.mock("../src/modules/maps/components/ElectoralMap", () => ({ ElectoralMap: () => null }));

const PLACE = {
  id: "35-z0012-l1",
  name: "Escola Municipal Sol",
  address: "Rua das Flores, 10",
  neighborhood: "Centro",
  zip_code: "01000-000",
  approximate: false,
  eligible_voters: 1500,
  municipality: { id: "3550308", name: "São Paulo" },
  zone: { id: "35-z0012", number: 12 },
  sections: [
    {
      id: "35-z0012-s0002",
      number: 2,
      status: "partial",
      eligible_voters: 400,
      turnout: 300,
      tallied_at: null,
    },
    {
      id: "35-z0012-s0001",
      number: 1,
      status: "tallied",
      eligible_voters: 380,
      turnout: 350,
      tallied_at: "2026-10-04T18:00:00Z",
    },
  ],
};

describe("polling place screen", () => {
  it("shows the place with its address, municipality, zone and the eligible voters", async () => {
    fakeApi({ "GET /polling-places/35-z0012-l1": PLACE });
    await renderScreen("/locais/35-z0012-l1");
    expect((await screen.findAllByText("Escola Municipal Sol")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Rua das Flores, 10 · Centro · 01000-000/)).toBeInTheDocument();
    expect(screen.getByText("Zona 12")).toBeInTheDocument();
    expect(screen.getByText(/1.500/)).toBeInTheDocument();
  });

  it("lists the sections in number order, with how many are tallied", async () => {
    fakeApi({ "GET /polling-places/35-z0012-l1": PLACE });
    await renderScreen("/locais/35-z0012-l1");
    expect(await screen.findByText("Seções (2)")).toBeInTheDocument();
    expect(screen.getByText("1 de 2 apuradas")).toBeInTheDocument();
    const numbers = screen.getAllByRole("link", { name: /^[12]$/ }).map((a) => a.textContent);
    expect(numbers).toEqual(["1", "2"]);
  });

  it("asks the API for the place of the URL, for the round of the filter", async () => {
    const api = fakeApi({ "GET /polling-places/35-z0012-l1": PLACE });
    await renderScreen("/locais/35-z0012-l1");
    await screen.findAllByText("Escola Municipal Sol");
    expect(api.calls("GET /polling-places/35-z0012-l1")[0]?.query.get("round")).toBe("1");
  });

  it("shows the error of the API with a retry button when the place cannot be loaded", async () => {
    fakeApi({});
    await renderScreen("/locais/35-z0012-l9");
    expect((await screen.findAllByText(/Não encontrado/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Tentar de novo/ }).length).toBeGreaterThan(0);
  });
});
