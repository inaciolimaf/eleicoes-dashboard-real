import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFilter, DEFAULT_FILTER } from "../src/lib/filter-store";
import { fakeApi, renderScreen } from "./helpers/screen";
import {
  candidate,
  candidateDetail,
  childCandidate,
  childItem,
  children,
  dto,
  elections,
  office,
  progress,
  progressItem,
  results,
  series,
} from "./helpers/data-results";
import type { StatusDto, TimelineDto, UserDto } from "../src/api/models";

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

/** Answers the shell asks for on every screen: the status, the elections, the timeline, the user and favorites. */
function shellAnswers(offices = elections()[0].offices) {
  return {
    "GET /status": dto<StatusDto>({
      tse_environment: "fake",
      live: true,
      now: "2026-10-04T20:00:00Z",
      last_tally: null,
      last_collection: null,
      release_start: null,
      pct_sections_br: 60,
      collector: dto<StatusDto["collector"]>({ paused: false }),
    }),
    "GET /elections": elections(offices),
    "GET /timeline": dto<TimelineDto>({ start: null, end: null, now: null, events: [] }),
    "GET /auth/me": dto<UserDto>({
      id: "u1",
      email: "eleitor@example.com",
      name: "Eleitor",
      is_admin: false,
    }),
    "GET /favorites": [],
    "GET /events": [],
  };
}

beforeEach(() => {
  (globalThis as { chartOptions?: unknown[] }).chartOptions = [];
  useFilter.setState(DEFAULT_FILTER);
});

afterEach(() => {
  useFilter.setState(DEFAULT_FILTER);
});

describe("explore screen", () => {
  it("shows the country result, the ranking and the areas table of the country", async () => {
    const api = fakeApi({
      ...shellAnswers(),
      "GET /results": results(),
      "GET /geo-areas/children": children([childItem({ name: "São Paulo", id: "sp", state_code: "sp" })]),
      "GET /results/series": series(),
    });
    await renderScreen("/explorar/br/br");
    expect(await screen.findByRole("heading", { name: "Brasil" })).toBeInTheDocument();
    expect((await screen.findAllByText("Maria Silva")).length).toBeGreaterThan(0);
    expect(await screen.findByText("São Paulo")).toBeInTheDocument();
    expect(api.calls("GET /results")[0]?.query.get("round")).toBe("1");
    expect(api.calls("GET /results")[0]?.query.get("level")).toBe("country");
    expect(api.calls("GET /geo-areas/children")[0]?.query.get("child_level")).toBeNull();
  });

  it("asks the user to pick a state when the office is decided state by state", async () => {
    useFilter.setState({ ...DEFAULT_FILTER, cargo: 3 });
    fakeApi({
      ...shellAnswers([
        office({ office_code: 3, name: "Governador", coverage: "uf", voting_system: "majoritario" }),
      ]),
      "GET /progress": progress([progressItem()]),
    });
    await renderScreen("/explorar/br/br");
    expect(await screen.findByText(/é disputado por UF/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "SP" })).toBeInTheDocument();
  });
});

describe("candidates screen", () => {
  const list = [
    candidate({
      tse_candidate_id: "100001",
      ballot_number: 13,
      ballot_name: "Maria Silva",
      party_abbreviation: "PT",
    }),
    candidate({
      tse_candidate_id: "100002",
      ballot_number: 45,
      ballot_name: "João Souza",
      party_abbreviation: "PSDB",
    }),
    candidate({
      tse_candidate_id: "100003",
      ballot_number: 30,
      ballot_name: "Ana Lima",
      party_abbreviation: "NOVO",
    }),
  ];

  it("titles the list with the office name the API sends", async () => {
    fakeApi({ ...shellAnswers(), "GET /candidates": [candidate({ office_name: "Cargo da API" })] });
    await renderScreen("/candidatos");
    expect(await screen.findByRole("heading", { name: "Cargo da API" })).toBeInTheDocument();
  });

  it("lists the candidates of the office and filters them by name", async () => {
    const api = fakeApi({ ...shellAnswers(), "GET /candidates": list });
    const { user } = await renderScreen("/candidatos");
    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByText("João Souza")).toBeInTheDocument();
    expect(api.calls("GET /candidates")[0]?.query.get("office")).toBe("1");

    await user.type(screen.getByPlaceholderText("Nome ou número…"), "ana");
    expect(screen.queryByText("Maria Silva")).not.toBeInTheDocument();
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Nome ou número…"));
    await user.type(screen.getByPlaceholderText("Nome ou número…"), "99");
    expect(screen.getByText("Nenhum candidato encontrado")).toBeInTheDocument();
  });

  it("filters by party", async () => {
    fakeApi({ ...shellAnswers(), "GET /candidates": list });
    const { user } = await renderScreen("/candidatos");
    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
    await user.click(screen.getByPlaceholderText("Partido"));
    await user.click(await screen.findByRole("option", { name: "PSDB" }));
    expect(screen.queryByText("Maria Silva")).not.toBeInTheDocument();
    expect(screen.getByText("João Souza")).toBeInTheDocument();
  });
});

describe("candidate screen", () => {
  it("shows the candidate, the favorite toggle and the regions where the candidate did best", async () => {
    const api = fakeApi({
      ...shellAnswers(),
      "GET /candidates/100001": candidateDetail({
        tse_candidate_id: "100001",
        ballot_name: "Maria Silva",
        state_code: "sp",
        office_code: 3,
      }),
      "GET /geo-areas/children": children(
        [childItem({ name: "Campinas", id: "3509502", level: "municipality", values: { "100001": 61 } })],
        [childCandidate({ tse_candidate_id: "100001", wins: 1 })],
        "municipality",
      ),
      "GET /maps/polling-places": { items: [], total: 0 },
    });
    await renderScreen("/candidatos/100001");
    expect((await screen.findAllByText("Maria Silva")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Campinas")).toBeInTheDocument();
    expect(screen.getByText(/Venceu em/)).toBeInTheDocument();
    expect(api.calls("GET /candidates/100001")[0]?.query.get("round")).toBe("1");
    expect(screen.getByRole("button", { name: "Favoritar candidato" })).toBeInTheDocument();
  });
});

describe("progress of the states", () => {
  it("is part of the country screen when the office is decided state by state", async () => {
    useFilter.setState({ ...DEFAULT_FILTER, cargo: 3 });
    fakeApi({
      ...shellAnswers([office({ office_code: 3, coverage: "uf", voting_system: "majoritario" })]),
      "GET /progress": progress([
        progressItem({ state_code: "sp" }),
        progressItem({ state_code: "rj", name: "Rio", pct_sections: 40 }),
      ]),
    });
    await renderScreen("/explorar/br/br");
    expect(await screen.findByText("Progresso por UF")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /São Paulo: 90/ })).toBeInTheDocument();
  });
});
