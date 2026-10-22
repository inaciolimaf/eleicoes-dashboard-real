import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../src/AppProviders";
import { DEFAULT_FILTER, useFilter } from "../src/lib/filter-store";
import { CandidateCard } from "../src/modules/results/components/CandidateCard";
import { CandidateAvatar } from "../src/modules/results/components/CandidateAvatar";
import { GeoAreaPicker, CandidatePicker } from "../src/modules/results/components/Pickers";
import { Scoreboard } from "../src/modules/results/scoreboard/Scoreboard";
import { StatusBadge } from "../src/modules/results/components/StatusBadge";
import { TotalsBlock } from "../src/modules/results/components/TotalsBlock";
import { WithResults } from "../src/modules/results/components/WithResults";
import { GeoAreaTable } from "../src/modules/results/geo-area-table/GeoAreaTable";
import { fakeApi } from "./helpers/screen";
import {
  alliance,
  candidateDetail,
  candidateResult,
  childItem,
  children,
  dto,
  elections,
  geoArea,
  office,
  results,
} from "./helpers/data-results";
import type { ResultsWithDataDto, ResultsWithoutDataDto } from "../src/api/models";

// the charts draw into a canvas, which jsdom does not have: the option they build is what the tests check
vi.mock("echarts-for-react/lib/core", async () => {
  const React = await import("react");
  return {
    default: (props: { option: unknown }) => {
      const charts = ((globalThis as { chartOptions?: unknown[] }).chartOptions ??= []);
      charts.push(props.option);
      return React.createElement("div", { "data-testid": "chart" });
    },
  };
});

/** Renders with the app's providers (theme, dates, notifications) and a router, as the screens do. */
function renderWithProviders(ui: ReactElement) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  Element.prototype.scrollIntoView = () => {};
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={client}>
      <AppProviders>
        <MemoryRouter>{ui}</MemoryRouter>
      </AppProviders>
    </QueryClientProvider>,
  );
  return { ...result, user };
}

beforeEach(() => {
  (globalThis as { chartOptions?: unknown[] }).chartOptions = [];
  useFilter.setState(DEFAULT_FILTER);
});

describe("status badge", () => {
  it("names the candidate's situation and the overall one when it differs", async () => {
    renderWithProviders(<StatusBadge status="LEADING" overallStatus="ELECTED" where="no Brasil" />);
    expect(screen.getByLabelText("Situação: Liderando")).toBeInTheDocument();
    expect(screen.getByLabelText("Situação: Eleito no Brasil")).toBeInTheDocument();
  });

  it("shows nothing for a candidate still being counted", () => {
    renderWithProviders(<StatusBadge status="COUNTING" />);
    expect(screen.queryByLabelText(/Situação:/)).not.toBeInTheDocument();
  });

  it("tells when the TSE published the situation", async () => {
    const { user } = renderWithProviders(
      <StatusBadge status="ELECTED" talliedAt="2026-10-04T20:00:00Z" size="md" />,
    );
    const badge = screen.getByLabelText("Situação: Eleito");
    await user.hover(badge);
    expect(await screen.findByText(/Publicado às/)).toBeInTheDocument();
  });
});

describe("totals block", () => {
  it("shows the valid votes and the counters of the area", () => {
    renderWithProviders(<TotalsBlock result={results()} />);
    expect(screen.getByText("Votos válidos")).toBeInTheDocument();
    expect(screen.getByText("Brancos")).toBeInTheDocument();
    expect(screen.getByText("Eleitorado")).toBeInTheDocument();
    expect(screen.getByText("das seções totalizadas")).toBeInTheDocument();
  });

  it("shows only the three main percentages in the compact layout", () => {
    renderWithProviders(<TotalsBlock result={results()} compact />);
    expect(screen.queryByText("Votos totais")).not.toBeInTheDocument();
    expect(screen.getByText("Abstenção")).toBeInTheDocument();
  });

  it("marks a final tally and a mathematically decided result", () => {
    const { unmount } = renderWithProviders(<TotalsBlock result={results({ final_tally: true })} />);
    expect(screen.getByText("Totalização final")).toBeInTheDocument();
    unmount();
    renderWithProviders(<TotalsBlock result={results({ mathematically_decided: true })} />);
    expect(screen.getByText("Matematicamente definido")).toBeInTheDocument();
  });

  it("notes how many sections of the area came from the urn ballots", () => {
    renderWithProviders(
      <TotalsBlock
        result={results({
          coverage: { collected_sections: 3, total_sections: 10 } as ResultsWithDataDto["coverage"],
        })}
      />,
    );
    expect(screen.getByText(/seções deste recorte coletadas/)).toBeInTheDocument();
  });

  it("explains the source and the signature on hover", async () => {
    const { user } = renderWithProviders(<TotalsBlock result={results({ jws_verified: false })} />);
    await user.hover(screen.getByText(/TSE ·/));
    expect(await screen.findByText(/FALHOU/)).toBeInTheDocument();
  });

  it("says when the signature is not checked, for a tally from the urn ballots", async () => {
    const { user } = renderWithProviders(
      <TotalsBlock result={results({ source: "bu", jws_verified: null as unknown as boolean })} />,
    );
    await user.hover(screen.getByText(/BU ·/));
    expect(await screen.findByText(/não verificada/)).toBeInTheDocument();
  });
});

describe("candidate card", () => {
  it("asks to pick a candidate when none is configured", () => {
    renderWithProviders(<CandidateCard tseCandidateId={null} />);
    expect(screen.getByText("Escolha um candidato")).toBeInTheDocument();
  });

  it("shows the candidate, the vice and substitutes, and the result of the area", async () => {
    fakeApi({
      "GET /candidates/100001": candidateDetail({
        tse_candidate_id: "100001",
        ballot_name: "Maria Silva",
        state_code: "sp",
        vice_and_substitutes: [
          { kind: "vice", name: "José Andrade" },
          { kind: "suplente", name: "Paulo Dias" },
        ],
        result: { votes: 5000, valid_pct: 50, position: 1, status: "LEADING" },
      }),
    });
    renderWithProviders(<CandidateCard tseCandidateId="100001" />);
    expect(await screen.findByRole("link", { name: "Maria Silva" })).toHaveAttribute(
      "href",
      "/candidatos/100001",
    );
    expect(screen.getByText("Vice: José Andrade · Suplente: Paulo Dias")).toBeInTheDocument();
    expect(screen.getByText("Posição")).toBeInTheDocument();
    expect(screen.getByText("1º")).toBeInTheDocument();
    expect(screen.getByLabelText("Situação: Liderando")).toBeInTheDocument();
    expect(screen.getByText("MS")).toBeInTheDocument();
  });

  it("separates the party, alliance and state with one dot each", async () => {
    fakeApi({
      "GET /candidates/100001": candidateDetail({
        tse_candidate_id: "100001",
        ballot_name: "Maria Silva",
        party_abbreviation: "PT",
        alliance: "Frente Ampla",
        state_code: "sp",
        result: null,
      }),
    });
    renderWithProviders(<CandidateCard tseCandidateId="100001" link={false} />);
    expect(await screen.findByText("PT · Frente Ampla · São Paulo")).toBeInTheDocument();
  });

  it("is plain text when it is not a link, and says so when no vote is counted", async () => {
    fakeApi({
      "GET /candidates/100001": candidateDetail({
        tse_candidate_id: "100001",
        ballot_name: "Maria Silva",
        result: null,
      }),
    });
    renderWithProviders(<CandidateCard tseCandidateId="100001" link={false} large />);
    expect(await screen.findByText("Sem votos apurados ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("candidate avatar", () => {
  it("shows the initials when there is no photo", () => {
    renderWithProviders(<CandidateAvatar name="Ana Paula Lima" color="#3D7BFF" size={48} />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });
});

describe("scoreboard", () => {
  it("lists the candidates by votes, with the state of each situation", () => {
    renderWithProviders(<Scoreboard result={results()} />);
    expect(screen.getByText("3 candidato(s) · 1 vaga")).toBeInTheDocument();
    const names = screen.getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["Maria Silva", "João Souza", "Ana Lima"]);
  });

  it("keeps only the elected when asked", async () => {
    const { user } = renderWithProviders(
      <Scoreboard
        result={results({
          candidates: [
            candidateResult({ tse_candidate_id: "1", ballot_name: "Eleita", status: "ELECTED" }),
            candidateResult({ tse_candidate_id: "2", ballot_name: "Outra" }),
          ],
        })}
      />,
    );
    expect(screen.getByText("Outra")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Só eleitos" }));
    await waitFor(() => expect(screen.queryByText("Outra")).not.toBeInTheDocument());
    expect(screen.getByText("Eleita")).toBeInTheDocument();
  });

  it("says when no one is elected yet, and lists everyone once the filter is off", async () => {
    const { user } = renderWithProviders(<Scoreboard result={results()} options={{ onlyElected: true }} />);
    expect(screen.getByText("Nenhum eleito definido ainda.")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Só eleitos" }));
    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
  });

  it("limits the rows with topN and hides the links and photos when asked", () => {
    renderWithProviders(
      <Scoreboard result={results()} options={{ topN: 2, linkCandidate: false, showPhotos: false }} />,
    );
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
    expect(screen.queryByText("Ana Lima")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("MS")).not.toBeInTheDocument();
  });

  it("adds the margin between the first two in majority offices", () => {
    renderWithProviders(<Scoreboard result={results()} />);
    expect(screen.getByText(/Diferença 1º × 2º/)).toBeInTheDocument();
  });

  it("shows the candidates and the parties of a proportional office in tabs", async () => {
    const { user } = renderWithProviders(
      <Scoreboard
        result={results({
          office: office({
            office_code: 6,
            name: "Deputado Federal",
            voting_system: "proporcional",
            seats: 70,
          }),
          alliances: [alliance({ name: "Frente Ampla", parties: ["PT", "PSB"], votes: 9000, seats: 40 })],
        })}
      />,
    );
    expect(screen.getByRole("tab", { name: "Candidatos" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Partidos/Federações" }));
    expect(await screen.findByText("Frente Ampla")).toBeInTheDocument();
    expect(screen.getByText("PT · PSB")).toBeInTheDocument();
    expect((globalThis as { chartOptions?: unknown[] }).chartOptions?.length).toBeGreaterThan(0);
  });

  it("says when the seats are not published yet", async () => {
    const { user } = renderWithProviders(
      <Scoreboard result={results({ office: office({ office_code: 6, voting_system: "proporcional" }) })} />,
    );
    await user.click(screen.getByRole("tab", { name: "Partidos/Federações" }));
    expect(await screen.findByText("Distribuição de vagas ainda não publicada.")).toBeInTheDocument();
  });
});

describe("with results", () => {
  it("asks for a state when the office has no national result", async () => {
    useFilter.setState({ ...DEFAULT_FILTER, cargo: 3 });
    const onSelectState = vi.fn();
    fakeApi({ "GET /elections": elections([office({ office_code: 3, coverage: "uf" })]) });
    const { user } = renderWithProviders(
      <WithResults onSelectState={onSelectState}>{() => <p>resultado</p>}</WithResults>,
    );
    expect(await screen.findByText(/é disputado por UF/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "AC" }));
    expect(onSelectState).toHaveBeenCalledWith("ac", "Acre");
  });

  it("renders the children with the result, and no data when the area has none", async () => {
    fakeApi({
      "GET /elections": elections(),
      "GET /results": results(),
    });
    const { unmount } = renderWithProviders(
      <WithResults>{(result) => <p>total de {result.totals.valid_votes}</p>}</WithResults>,
    );
    expect(await screen.findByText("total de 700")).toBeInTheDocument();
    unmount();

    fakeApi({
      "GET /elections": elections(),
      "GET /results": dto<ResultsWithoutDataDto>({ no_data: true, geo_area: geoArea(), office: office() }),
    });
    renderWithProviders(<WithResults>{() => <p>nunca</p>}</WithResults>);
    expect(await screen.findByText("Sem dados ainda")).toBeInTheDocument();
  });
});

describe("pickers", () => {
  it("picks a state from the list of states, with its geo area value", async () => {
    fakeApi({ "GET /search": { items: [] } });
    const onChange = vi.fn();
    const { user } = renderWithProviders(<GeoAreaPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole("textbox"));
    await user.click(await screen.findByRole("option", { name: "Acre (AC)" }));
    expect(onChange).toHaveBeenCalledWith("uf:ac", "Acre (AC)");
  });

  it("picks a candidate of the round and office", async () => {
    fakeApi({
      "GET /candidates": [
        candidateDetail({
          tse_candidate_id: "100001",
          ballot_name: "Maria Silva",
          ballot_number: 13,
          party_abbreviation: "PT",
          state_code: null,
        }),
      ],
    });
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <CandidatePicker value={null} onChange={onChange} round={1} office={1} state={null} />,
    );
    await user.click(screen.getByRole("textbox"));
    await user.click(await screen.findByRole("option", { name: "Maria Silva (13) · PT" }));
    expect(onChange.mock.calls[0][0]).toBe("100001");
  });
});

describe("geo area table", () => {
  const states = [
    childItem({ id: "sp", name: "São Paulo", state_code: "sp", region: "Sudeste", electorate: 34_000_000 }),
    childItem({
      id: "rj",
      name: "Rio de Janeiro",
      state_code: "rj",
      region: "Sudeste",
      electorate: 12_000_000,
    }),
    childItem({ id: "am", name: "Amazonas", state_code: "am", region: "Norte", electorate: 3_000_000 }),
  ];

  it("lists the children of the area, largest electorate first", async () => {
    fakeApi({ "GET /geo-areas/children": children(states) });
    renderWithProviders(<GeoAreaTable level="country" id="br" childLevel="state" />);
    expect(await screen.findByText("São Paulo")).toBeInTheDocument();
    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("São Paulo");
    expect(rows[2]).toContain("Amazonas");
  });

  it("sorts by a column when its header is clicked, and filters by the name search", async () => {
    fakeApi({ "GET /geo-areas/children": children(states) });
    const { user } = renderWithProviders(<GeoAreaTable level="country" id="br" childLevel="state" />);
    await screen.findByText("São Paulo");
    await user.click(screen.getByRole("button", { name: /Eleitorado/ }));
    await waitFor(() => expect(screen.getAllByRole("row")[1].textContent).toContain("Amazonas"));
    await user.type(screen.getByPlaceholderText(/Buscar/), "rio");
    await waitFor(() => expect(screen.queryByText("São Paulo")).not.toBeInTheDocument());
    expect(screen.getByText("Rio de Janeiro")).toBeInTheDocument();
  });

  it("calls back with the area when its row is clicked", async () => {
    fakeApi({ "GET /geo-areas/children": children(states) });
    const onSelect = vi.fn();
    const { user } = renderWithProviders(
      <GeoAreaTable level="country" id="br" childLevel="state" onSelect={onSelect} showFilters={false} />,
    );
    await user.click(await screen.findByText("Amazonas"));
    expect(onSelect).toHaveBeenCalledWith("state", "am", "Amazonas");
  });

  it("groups the rows by region, with the totals on each group", async () => {
    fakeApi({ "GET /geo-areas/children": children(states) });
    const { user } = renderWithProviders(<GeoAreaTable level="country" id="br" childLevel="state" />);
    await screen.findByText("São Paulo");
    await user.click(screen.getAllByLabelText("Agrupamento")[0]);
    await user.click(await screen.findByRole("option", { name: "Agrupar por região" }));
    const group = (await screen.findAllByText("Sudeste"))[0];
    expect(within(group.closest("tr") as HTMLElement).getByText(/2 itens/)).toBeInTheDocument();
    await user.click(group);
    expect(await screen.findByText("São Paulo")).toBeInTheDocument();
  });

  it("says when the area has no children with data", async () => {
    fakeApi({ "GET /geo-areas/children": children([], [], "municipality") });
    renderWithProviders(<GeoAreaTable level="state" id="sp" childLevel="municipality" />);
    expect(await screen.findByText("Sem municípios com dados")).toBeInTheDocument();
  });
});
