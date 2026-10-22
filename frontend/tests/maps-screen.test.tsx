import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";
import { DEFAULT_FILTER, useFilter } from "../src/lib/filter-store";

// maplibre does not run in jsdom: the map is replaced by a stub that keeps the deck.gl props,
// so the tests can call the hover and click handlers the way deck.gl would.
type OverlayStub = { props: Record<string, (info: unknown) => void> };
const overlay = vi.hoisted(() => ({ current: null as OverlayStub | null }));

vi.mock("react-map-gl/maplibre", async () => {
  const { forwardRef, createElement } = await import("react");
  const MapGL = forwardRef<unknown, { children?: unknown }>((props, _ref) =>
    createElement("div", { "data-testid": "map" }, props.children as never),
  );
  return {
    default: MapGL,
    NavigationControl: () => null,
    useControl: (factory: () => unknown) => factory(),
  };
});

vi.mock("@deck.gl/mapbox", () => ({
  MapboxOverlay: class {
    props: OverlayStub["props"];
    constructor(props: OverlayStub["props"]) {
      this.props = props;
      overlay.current = this;
    }
    setProps(props: OverlayStub["props"]) {
      this.props = props;
      overlay.current = this;
    }
  },
}));

const STATES = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { uf: "SP", nome: "São Paulo" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-53, -25],
            [-44, -25],
            [-44, -20],
            [-53, -20],
            [-53, -25],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { uf: "RJ", nome: "Rio de Janeiro" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-44, -23],
            [-41, -23],
            [-41, -21],
            [-44, -21],
            [-44, -23],
          ],
        ],
      },
    },
  ],
};

const CANDIDATES = [
  {
    tse_candidate_id: "280001",
    ballot_name: "Ana Azul",
    ballot_number: 13,
    party_abbreviation: "PT",
    color: "#D7191C",
    wins: 1,
  },
  {
    tse_candidate_id: "280002",
    ballot_name: "Bia Verde",
    ballot_number: 22,
    party_abbreviation: "PL",
    color: "#2E7D32",
    wins: 1,
  },
];

const leader = (id: number) => ({
  tse_candidate_id: CANDIDATES[id].tse_candidate_id,
  ballot_name: CANDIDATES[id].ballot_name,
  color: CANDIDATES[id].color,
  pct: 55.5,
  votes: 1000,
});

const CHILDREN = {
  level: "country",
  id: "br",
  candidates: CANDIDATES,
  items: [
    {
      id: "sp",
      name: "São Paulo",
      level: "state",
      state_code: "SP",
      status: "partial",
      pct_sections: 60,
      valid_votes: 5000,
      electorate: 9000,
      turnout: 6000,
      leader: leader(0),
      second: leader(1),
      margin_pp: 12,
      leader_party: { abbreviation: "PT", color: "#D7191C" },
      values: { "280001": 55.5, "280002": 44.5 },
    },
    {
      id: "rj",
      name: "Rio de Janeiro",
      level: "state",
      state_code: "RJ",
      status: "not_received",
      pct_sections: 0,
      valid_votes: 0,
      electorate: 4000,
      turnout: 0,
      leader: null,
      second: null,
      margin_pp: null,
      leader_party: null,
      values: {},
    },
  ],
};

function mapApi() {
  return fakeApi({
    "GET /geo/br-uf.json": STATES,
    "GET /geo-areas/children": CHILDREN,
  });
}

/** The stub of the latest map: waits until the map has mounted its overlay. */
async function mountedOverlay(): Promise<OverlayStub> {
  await waitFor(() => expect(overlay.current).not.toBeNull());
  return overlay.current as OverlayStub;
}

describe("maps screen", () => {
  beforeEach(() => {
    overlay.current = null;
    // a state selected by an earlier test would switch the map to its municipalities
    useFilter.setState({ ...DEFAULT_FILTER });
  });

  it("draws the states with the legend of the winners", async () => {
    mapApi();
    await renderScreen("/mapas");
    expect(await screen.findByText("Clique em um candidato para destacar onde venceu")).toBeInTheDocument();
    expect(screen.getByTestId("map")).toBeInTheDocument();
  });

  it("highlights a candidate from the legend and says where it won", async () => {
    mapApi();
    const { user } = await renderScreen("/mapas");
    const button = await screen.findByRole("button", { name: /Ana Azul/ });
    await user.click(button);
    expect(await screen.findByText(/venceu em 1 UFs/)).toBeInTheDocument();
  });

  it("offers the two candidate selectors on the comparison map", async () => {
    mapApi();
    await renderScreen("/mapas?tipo=comparativo");
    expect((await screen.findAllByLabelText("Candidato A")).length).toBeGreaterThan(0);
    expect((await screen.findAllByLabelText("Candidato B")).length).toBeGreaterThan(0);
    expect(screen.getByText("Diferença em p.p.")).toBeInTheDocument();
  });

  it("shows the region under the pointer in a tooltip", async () => {
    mapApi();
    await renderScreen("/mapas");
    await screen.findByText("Clique em um candidato para destacar onde venceu");
    const feature = { key: "sp", properties: { uf: "SP", nome: "São Paulo" } };
    const map = await mountedOverlay();
    act(() => map.props.onHover({ x: 120, y: 80, object: feature, layer: { id: "regioes" } }));
    expect(await screen.findByText(/Líder:/)).toBeInTheDocument();
    expect(screen.getByText(/Margem:/)).toBeInTheDocument();
  });

  it("selects the region of a click in the global filter", async () => {
    mapApi();
    await renderScreen("/mapas");
    await screen.findByText("Clique em um candidato para destacar onde venceu");
    const feature = { key: "sp", properties: { uf: "SP", nome: "São Paulo" } };
    const map = await mountedOverlay();
    act(() => map.props.onClick({ object: feature, layer: { id: "regioes" } }));
    await waitFor(() => expect(useFilter.getState()).toMatchObject({ nivel: "state", id: "sp" }));
  });

  it("selects an area without data by its state code", async () => {
    mapApi();
    await renderScreen("/mapas");
    await screen.findByText("Clique em um candidato para destacar onde venceu");
    const feature = { key: "rj", properties: { uf: "RJ", nome: "Rio de Janeiro" } };
    const map = await mountedOverlay();
    act(() => map.props.onClick({ object: feature, layer: { id: "regioes" } }));
    await waitFor(() => expect(useFilter.getState()).toMatchObject({ nivel: "state", id: "rj" }));
  });

  it("clears the tooltip when nothing is under the pointer", async () => {
    mapApi();
    await renderScreen("/mapas");
    await screen.findByText("Clique em um candidato para destacar onde venceu");
    const map = await mountedOverlay();
    act(() => map.props.onHover({ x: 10, y: 10, object: null, layer: null }));
    expect(screen.queryByText(/Líder:/)).not.toBeInTheDocument();
  });
});
