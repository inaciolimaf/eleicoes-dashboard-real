import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../src/AppProviders";
import { DEFAULT_FILTER, useFilter } from "../src/lib/filter-store";
import { Donut } from "../src/modules/charts/components/Donut";
import { EChart, themeOption, useChartColors } from "../src/modules/charts/components/EChart";
import { Evolution } from "../src/modules/charts/components/Evolution";
import { Hemicycle } from "../src/modules/charts/components/Hemicycle";
import { ProgressHeatmap } from "../src/modules/charts/components/ProgressHeatmap";
import { CHART_THEMES } from "../src/lib/palettes/charts";
import { fakeApi } from "./helpers/screen";
import { alliance, progress, progressItem, results, series } from "./helpers/data-results";

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

/** The option of the last chart drawn, as the test sees it. */
function lastOption(): Record<string, unknown> {
  const charts = (globalThis as { chartOptions?: unknown[] }).chartOptions ?? [];
  return charts[charts.length - 1] as Record<string, unknown>;
}

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

describe("theme of the charts", () => {
  it("applies the frame colors, and the chart's own tooltip replaces the themed one", () => {
    const themed = themeOption({ series: [] }, CHART_THEMES.light, true);
    expect(themed).toMatchObject({
      backgroundColor: "transparent",
      animation: true,
      textStyle: { color: CHART_THEMES.light.text },
      tooltip: { backgroundColor: CHART_THEMES.light.tooltipBackground },
    });
    const own = themeOption(
      { tooltip: { trigger: "item" }, animation: false, series: [] },
      CHART_THEMES.light,
      true,
    );
    expect(own).toMatchObject({ animation: false, tooltip: { trigger: "item" } });
    expect((own.tooltip as { backgroundColor?: string }).backgroundColor).toBeUndefined();
  });

  it("reads the colors of the color scheme in use", () => {
    function Probe() {
      const colors = useChartColors();
      return <p>{colors.text}</p>;
    }
    renderWithProviders(<Probe />);
    expect(screen.getByText(CHART_THEMES.dark.text)).toBeInTheDocument();
  });

  it("passes the themed option to ECharts", () => {
    renderWithProviders(<EChart option={{ series: [] }} height={120} />);
    const option = lastOption();
    expect(option.backgroundColor).toBe("transparent");
    expect(option.animation).toBe(true);
  });
});

describe("donut", () => {
  it("draws the candidates of the result", () => {
    renderWithProviders(<Donut result={results()} topN={2} includeBlankNull height={200} />);
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    const series = (lastOption().series as { data: { name: string }[] }[])[0];
    expect(series.data.map((slice) => slice.name)).toEqual([
      "Maria Silva",
      "João Souza",
      "Outros",
      "Brancos",
      "Nulos",
    ]);
  });
});

describe("hemicycle", () => {
  it("draws one dot per seat of each alliance", () => {
    renderWithProviders(<Hemicycle alliances={[alliance({ name: "Frente", seats: 2 })]} height={180} />);
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    const series = lastOption().series as { name: string; data: unknown[] }[];
    expect(series).toEqual([expect.objectContaining({ name: "Frente" })]);
    expect(series[0].data).toHaveLength(2);
  });
});

describe("evolution", () => {
  it("draws the followed candidates of the area", async () => {
    fakeApi({ "GET /results/series": series() });
    renderWithProviders(<Evolution metric="pct" xAxis="t" style="area" topN={2} height={240} />);
    expect(await screen.findByTestId("chart")).toBeInTheDocument();
    const lines = lastOption().series as { name: string }[];
    expect(lines.map((line) => line.name)).toEqual(["Maria Silva (13)", "João Souza (45)"]);
  });

  it("says that the chart waits for the first snapshots when there are no points", async () => {
    fakeApi({ "GET /results/series": series({ points: [] }) });
    renderWithProviders(<Evolution />);
    expect(await screen.findByText("Sem série histórica ainda")).toBeInTheDocument();
  });
});

describe("progress heatmap", () => {
  const states = [
    progressItem({ state_code: "sp", name: "São Paulo", pct_sections: 90 }),
    progressItem({ state_code: "rj", name: "Rio de Janeiro", pct_sections: 40 }),
    progressItem({ state_code: "zz", name: "Exterior", pct_sections: 5 }),
  ];

  it("shows the tiles of the states on the map, with the country's progress", async () => {
    fakeApi({ "GET /progress": progress(states) });
    renderWithProviders(<ProgressHeatmap />);
    expect(await screen.findByRole("button", { name: /São Paulo/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rio de Janeiro/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Exterior/ })).not.toBeInTheDocument();
    expect(screen.getByText("Brasil:")).toBeInTheDocument();
  });

  it("calls back with the state picked, and lists the abroad too in the list mode", async () => {
    fakeApi({ "GET /progress": progress(states) });
    const onSelectState = vi.fn();
    const { user } = renderWithProviders(
      <ProgressHeatmap mode="list" onSelectState={onSelectState} metric="pct_comparecimento" />,
    );
    await user.click(await screen.findByText(/RJ/));
    expect(onSelectState).toHaveBeenCalledWith("rj", "Rio de Janeiro");
    expect(screen.getByText(/ZZ/)).toBeInTheDocument();
  });

  it("says when there is no progress to show", async () => {
    fakeApi({ "GET /progress": progress([]) });
    renderWithProviders(<ProgressHeatmap />);
    expect(await screen.findByText("Sem dados ainda")).toBeInTheDocument();
  });
});
