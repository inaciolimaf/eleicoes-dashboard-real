import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";

vi.mock("../src/modules/maps/components/ElectoralMap", () => ({ ElectoralMap: () => null }));

const SECTION = {
  id: "35-z0012-s0034",
  number: 34,
  status: "tallied",
  state_code: "sp",
  eligible_voters: 300,
  turnout: 240,
  issued_at: "2026-10-04T17:50:00Z",
  tallied_at: "2026-10-04T18:05:00Z",
  hash: "ab12cd34",
  bu_url: "https://resultados.tse.jus.br/bu/35-z0012-s0034.bu",
  signature_valid: true,
  polling_place: { id: "35-z0012-l1", name: "Escola Municipal Sol" },
  zone: { id: "35-z0012", number: 12 },
  municipality: { id: "3550308", name: "São Paulo" },
  offices: [
    {
      office_code: 1,
      name: "Presidente",
      valid_votes: 200,
      blank_votes: 20,
      null_votes: 10,
      turnout: 230,
      votes: [
        {
          kind: "candidato",
          number: 13,
          ballot_name: "Ana Azul",
          party_abbreviation: "PT",
          tse_candidate_id: "280001",
          color: "#D7191C",
          votes: 150,
        },
        {
          kind: "legenda",
          number: null,
          ballot_name: null,
          party_abbreviation: "PL",
          tse_candidate_id: null,
          color: null,
          votes: 50,
        },
      ],
    },
  ],
};

describe("section screen", () => {
  it("shows the section, its place and the signature of the ballot box", async () => {
    fakeApi({ "GET /polling-sections/35-z0012-s0034": SECTION });
    await renderScreen("/secoes/35-z0012-s0034");
    expect(await screen.findByText("Assinatura válida")).toBeInTheDocument();
    expect(screen.getByText("Escola Municipal Sol")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /BU bruto \(TSE\)/ })).toHaveAttribute("href", SECTION.bu_url);
  });

  it("shows the votes of the office of the filter, with the ballot names and the party lists", async () => {
    fakeApi({ "GET /polling-sections/35-z0012-s0034": SECTION });
    await renderScreen("/secoes/35-z0012-s0034");
    expect(await screen.findByText(/Ana Azul/)).toBeInTheDocument();
    expect(screen.getByText(/Legenda PL/)).toBeInTheDocument();
    expect(screen.getByText(/Válidos/)).toBeInTheDocument();
  });

  it("asks for the section by its TSE numbers when the URL is the long form", async () => {
    const api = fakeApi({ "GET /polling-sections/sp3550308-z0012-s0034": SECTION });
    await renderScreen("/secoes/sp/3550308/12/34");
    await screen.findByText(/Ana Azul/);
    expect(api.calls("GET /polling-sections/sp3550308-z0012-s0034")).toHaveLength(1);
  });

  it("says when the section has no ballot box yet", async () => {
    fakeApi({ "GET /polling-sections/35-z0012-s0034": { ...SECTION, offices: [] } });
    await renderScreen("/secoes/35-z0012-s0034");
    expect(await screen.findByText("Boletim de urna ainda não coletado")).toBeInTheDocument();
  });
});
