import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  DEFAULT_FILTERS,
  countActiveFilters,
  filterItems,
  groupItems,
  orderedGroupKeys,
  sizeBandOf,
  sortItems,
  sortValue,
  type TableFilters,
} from "../src/modules/results/geo-area-table/geoAreaModel";
import {
  isElected,
  orderByVotes,
  showsMajorityLine,
  summaryLine,
  visibleRows,
  whereLabel,
} from "../src/modules/results/scoreboard/scoreboardRows";
import { filterCandidates, partyOptions } from "../src/modules/results/candidates-list/candidatesList";
import { buildHemicycleOption, seatPositions } from "../src/modules/charts/hemicycleOption";
import { buildDonutOption } from "../src/modules/charts/donutOption";
import { buildEvolutionOption } from "../src/modules/charts/evolutionOption";
import { STATE_GRID } from "../src/modules/charts/stateGrid";
import { CHART_THEMES } from "../src/lib/palettes/charts";
import {
  alliance,
  candidate,
  candidateResult,
  childItem,
  geoArea,
  office,
  results,
  series,
} from "./helpers/data-results";

/** Reads one field of a chart option (the option types are wide unions; the tests check the shape they build). */
function field<T>(option: object | null, key: string): T {
  return (option as Record<string, unknown>)[key] as T;
}

const colors = CHART_THEMES.dark;
const colorOf = (id: string) => `color-${id}`;

function candidateLeader(name: string, id: string) {
  return {
    tse_candidate_id: id,
    ballot_name: name,
    color: "#111111",
    ballot_number: 1,
    party_abbreviation: "P",
    votes: 1,
    pct: 50,
  };
}

describe("geo area table model", () => {
  it("sorts every column by the value the table shows", () => {
    const item = childItem({
      name: "Álvares",
      state_code: "ac",
      region: "Norte",
      pct_sections: 42,
      margin_pp: null as unknown as number,
      valid_votes: 10,
      electorate: 200,
      turnout: 100,
      pct_abstention: 50,
      is_capital: true,
      leader_party: null,
      leader: null,
      second: null,
    });
    const values = Object.fromEntries(COLUMNS.map((column) => [column.id, sortValue(item, column.id)]));
    expect(values).toMatchObject({
      nome: "alvares",
      uf: "ac",
      regiao: "Norte",
      pct_secoes: 42,
      lider: "",
      segundo: "",
      margem_pp: -1,
      votos_validos: 10,
      eleitorado: 200,
      comparecimento: 0.5,
      abstencao: 50,
      capital: 1,
      partido: "",
    });
    expect(sortValue(childItem({ electorate: 0 }), "comparecimento")).toBe(0);
    expect(sortValue(childItem({ leader_party: { abbreviation: "PT", color: "#fff" } }), "partido")).toBe(
      "PT",
    );
  });

  it("bands the electorate by size", () => {
    expect(sizeBandOf(9_999)).toBe("Até 10 mil eleitores");
    expect(sizeBandOf(10_000)).toBe("10 mil – 50 mil");
    expect(sizeBandOf(5_000_000)).toBe("Mais de 1 milhão");
  });

  it("keeps the rows that match every filter, ignoring accents and case in the search", () => {
    const items = [
      childItem({
        id: "1",
        name: "São Paulo",
        state_code: "sp",
        region: "Sudeste",
        pct_sections: 90,
        electorate: 100,
        is_capital: true,
        margin_pp: 12,
        leader: candidateLeader("A", "100001"),
      }),
      childItem({
        id: "2",
        name: "Campinas",
        state_code: "sp",
        region: "Sudeste",
        pct_sections: 10,
        electorate: 5000,
        is_capital: false,
        margin_pp: 1,
        leader: candidateLeader("B", "100002"),
      }),
      childItem({
        id: "3",
        name: "Manaus",
        state_code: "am",
        region: "Norte",
        pct_sections: 50,
        electorate: 9000,
        is_capital: true,
        margin_pp: 40,
        leader: null,
      }),
    ];
    const ids = (filters: Partial<TableFilters>, search = "") =>
      filterItems(items, { ...DEFAULT_FILTERS, ...filters }, search).map((item) => item.id);
    expect(ids({}, "sao PAULO")).toEqual(["1"]);
    expect(ids({ states: ["am"] })).toEqual(["3"]);
    expect(ids({ regions: ["Sudeste"] })).toEqual(["1", "2"]);
    expect(ids({ tallied: [40, 100] })).toEqual(["1", "3"]);
    expect(ids({ winner: "100001" })).toEqual(["1"]);
    expect(ids({ margin: [5, 100] })).toEqual(["1", "3"]);
    expect(ids({ capital: "capital" })).toEqual(["1", "3"]);
    expect(ids({ capital: "inland" })).toEqual(["2"]);
    expect(ids({ minElectorate: 1000 })).toEqual(["2", "3"]);
  });

  it("sorts a copy by a column, ascending or descending", () => {
    const items = [
      childItem({ id: "a", name: "Zeta", electorate: 10 }),
      childItem({ id: "b", name: "Alfa", electorate: 30 }),
    ];
    expect(sortItems(items, "eleitorado", true).map((i) => i.id)).toEqual(["b", "a"]);
    expect(sortItems(items, "eleitorado", false).map((i) => i.id)).toEqual(["a", "b"]);
    expect(sortItems(items, "nome", false).map((i) => i.id)).toEqual(["b", "a"]);
    expect(items[0].id).toBe("a");
  });

  it("counts the filters that differ from their default", () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(
      countActiveFilters({
        ...DEFAULT_FILTERS,
        states: ["sp"],
        regions: ["Norte"],
        tallied: [10, 100],
        winner: "A",
        margin: [0, 50],
        capital: "inland",
        minElectorate: 100,
      }),
    ).toBe(7);
  });

  it("groups by region, state or size band, in the display order, then the keys not listed", () => {
    const items = [
      childItem({
        id: "1",
        state_code: "sp",
        region: "Sudeste",
        electorate: 100,
        pct_sections: 50,
        valid_votes: 10,
        leader: candidateLeader("A", "100001"),
      }),
      childItem({
        id: "2",
        state_code: "am",
        region: "Norte",
        electorate: 300,
        pct_sections: 100,
        valid_votes: 20,
        leader: candidateLeader("A", "100001"),
      }),
      childItem({
        id: "3",
        state_code: null,
        region: null,
        electorate: 20_000,
        pct_sections: 0,
        valid_votes: 0,
        leader: null,
      }),
    ];
    const byRegion = groupItems(
      items,
      "region",
      colorOf,
      orderedGroupKeys(items, "region", ["Norte", "Sudeste"]),
    );
    expect(byRegion.map((g) => g.key)).toEqual(["Norte", "Sudeste", "—"]);
    expect(byRegion[0]).toMatchObject({
      electorate: 300,
      valid: 20,
      pct: 100,
      winners: [{ name: "A", count: 1, color: "color-100001" }],
    });
    expect(byRegion[2].winners).toEqual([]);

    const byState = groupItems(items, "state", colorOf, orderedGroupKeys(items, "state", []));
    expect(byState.map((g) => g.key)).toEqual(["", "AM", "SP"]);

    const bySize = groupItems(items, "size", colorOf, orderedGroupKeys(items, "size", []));
    expect(bySize.map((g) => g.key)).toEqual(["Até 10 mil eleitores", "10 mil – 50 mil"]);
    expect(bySize[0].pct).toBeCloseTo((50 * 100 + 100 * 300) / 400);
  });

  it("keeps the keys that the order does not list at the end", () => {
    const items = [childItem({ region: "Atlântico" }), childItem({ id: "2", region: "Norte" })];
    const groups = groupItems(items, "region", colorOf, ["Norte"]);
    expect(groups.map((g) => g.key)).toEqual(["Norte", "Atlântico"]);
  });

  it("marks the numeric columns", () => {
    const numeric = COLUMNS.filter((column) => column.num).map((column) => column.id);
    expect(numeric).toContain("eleitorado");
    expect(numeric).not.toContain("nome");
  });
});

describe("scoreboard rows", () => {
  it("names where the situation applies", () => {
    expect(whereLabel(results())).toBe("no Brasil");
    expect(
      whereLabel(results({ office: office({ office_code: 3 }), geo_area: geoArea({ state_code: "sp" }) })),
    ).toBe("em SP");
    expect(
      whereLabel(
        results({
          office: office({ office_code: 6 }),
          geo_area: geoArea({ state_code: null, breadcrumb: [{ level: "state", id: "rj", name: "Rio" }] }),
        }),
      ),
    ).toBe("em RJ");
    expect(
      whereLabel(
        results({
          office: office({ office_code: 6 }),
          geo_area: geoArea({ state_code: null, breadcrumb: [] }),
        }),
      ),
    ).toBe("na UF");
  });

  it("orders by votes, then by ballot position, and recognizes the elected", () => {
    const ordered = orderByVotes([
      candidateResult({ tse_candidate_id: "b", votes: 10, position: 2 }),
      candidateResult({ tse_candidate_id: "a", votes: 10, position: 1 }),
      candidateResult({ tse_candidate_id: "c", votes: 20, position: 3 }),
    ]);
    expect(ordered.map((c) => c.tse_candidate_id)).toEqual(["c", "a", "b"]);
    expect(isElected(candidateResult({ elected: true }))).toBe(true);
    expect(isElected(candidateResult({ status: "ELECTED" }))).toBe(true);
    expect(isElected(candidateResult({ overall_status: "ELECTED" }))).toBe(true);
    expect(isElected(candidateResult({}))).toBe(false);
  });

  it("shows the elected only when asked and the first topN rows when set", () => {
    const list = [
      candidateResult({ tse_candidate_id: "1", status: "ELECTED" }),
      candidateResult({ tse_candidate_id: "2" }),
      candidateResult({ tse_candidate_id: "3", elected: true }),
    ];
    expect(visibleRows(list, { onlyElected: false })).toHaveLength(3);
    expect(visibleRows(list, { onlyElected: true }).map((c) => c.tse_candidate_id)).toEqual(["1", "3"]);
    expect(visibleRows(list, { onlyElected: false, topN: 2 })).toHaveLength(2);
    expect(visibleRows(list, { onlyElected: false, topN: 0 })).toHaveLength(3);
  });

  it("draws the 50% line only for the president and the governor", () => {
    expect(showsMajorityLine(results())).toBe(true);
    expect(showsMajorityLine(results({ office: office({ office_code: 3 }) }))).toBe(true);
    expect(showsMajorityLine(results({ office: office({ office_code: 5 }) }))).toBe(false);
  });

  it("summarizes the candidates, the seats and the state", () => {
    expect(summaryLine(results())).toBe("3 candidato(s) · 1 vaga");
    expect(
      summaryLine(
        results({ office: office({ office_code: 3, seats: 3 }), geo_area: geoArea({ state_code: "sp" }) }),
      ),
    ).toBe("3 candidato(s) · 3 vagas · São Paulo");
    expect(
      summaryLine(
        results({ office: office({ office_code: 6, seats: 70 }), geo_area: geoArea({ state_code: "zz" }) }),
      ),
    ).toBe("3 candidato(s) · 70 vagas · ZZ");
  });
});

describe("candidates list", () => {
  it("lists the parties once, sorted", () => {
    expect(
      partyOptions([
        candidate({ party_abbreviation: "PT" }),
        candidate({ party_abbreviation: "MDB" }),
        candidate({ party_abbreviation: "PT" }),
      ]),
    ).toEqual(["MDB", "PT"]);
  });

  it("filters by party and by an accent-insensitive search, sorted by ballot number", () => {
    const list = [
      candidate({
        tse_candidate_id: "1",
        ballot_name: "João",
        name: "João Souza",
        ballot_number: 45,
        party_abbreviation: "PSDB",
      }),
      candidate({
        tse_candidate_id: "2",
        ballot_name: "Maria",
        name: "Maria Silva",
        ballot_number: 13,
        party_abbreviation: "PT",
      }),
      candidate({
        tse_candidate_id: "3",
        ballot_name: "Joana",
        name: "Joana",
        ballot_number: null,
        party_abbreviation: "PT",
      }),
    ];
    expect(filterCandidates(list, { search: "", party: "PT" }).map((c) => c.tse_candidate_id)).toEqual([
      "3",
      "2",
    ]);
    expect(filterCandidates(list, { search: "joao", party: null }).map((c) => c.tse_candidate_id)).toEqual([
      "1",
    ]);
    expect(filterCandidates(list, { search: "45", party: null }).map((c) => c.tse_candidate_id)).toEqual([
      "1",
    ]);
  });
});

describe("hemicycle geometry", () => {
  it("places the seats in concentric rows, from left to right", () => {
    expect(seatPositions(0)).toEqual([]);
    const single = seatPositions(1);
    expect(single).toHaveLength(1);
    expect(single[0].x).toBeCloseTo(0);
    expect(single[0].y).toBeCloseTo(1);
    const many = seatPositions(120);
    expect(many).toHaveLength(120);
    expect(many[0].x).toBeLessThan(many[many.length - 1].x);
  });

  it("builds one scatter series per alliance with the seats total as caption", () => {
    const option = buildHemicycleOption([
      alliance({ name: "A", seats: 3, votes: 300, parties: ["PT", "PSB"] }),
      alliance({ name: "B", seats: 0 }),
      alliance({ name: "C", seats: null }),
      alliance({ name: "D", seats: 1, votes: 50 }),
    ]);
    const series = field<{ name: string; data: unknown[]; tooltip: { formatter: () => string } }[]>(
      option,
      "series",
    );
    expect(series.map((s) => s.name)).toEqual(["A", "D"]);
    expect(series[0].data).toHaveLength(3);
    expect(series[0].tooltip.formatter()).toContain("PT · PSB");
    const graphic = field<{ style: { text: string } }[]>(option, "graphic");
    expect(graphic[0].style.text).toBe("4 vagas");
    const empty = buildHemicycleOption([]);
    expect(field<{ style: { text: string } }[]>(empty, "graphic")[0].style.text).toBe("0 vagas");
  });
});

describe("donut chart option", () => {
  it("shows the top candidates, groups the rest as others, and adds blank and null votes on request", () => {
    const result = results();
    const option = buildDonutOption({
      result,
      topN: 2,
      includeBlankNull: true,
      colors,
      colorOf: (candidateResult) => colorOf(candidateResult.tse_candidate_id),
    });
    const data = field<{ name: string; value: number; itemStyle: { color: string } }[]>(
      field<object[]>(option, "series")[0],
      "data",
    );
    expect(data.map((d) => d.name)).toEqual(["Maria Silva", "João Souza", "Outros", "Brancos", "Nulos"]);
    expect(data[0].itemStyle.color).toBe("color-100001");
    const tooltip = field<{ formatter: (p: unknown) => string }>(option, "tooltip");
    expect(tooltip.formatter({ name: "Outros", value: 2000, percent: 12.5 })).toContain("<b>Outros</b>");
    const center = field<{ children: { style: { text: string } }[] }[]>(option, "graphic")[0];
    expect(center.children[0].style.text).toBe("10.050");
    expect(center.children[1].style.text).toBe("votos");

    const plain = buildDonutOption({ result, topN: 6, includeBlankNull: false, colors, colorOf: () => "x" });
    expect(field<{ data: unknown[] }[]>(plain, "series")[0].data).toHaveLength(3);
    expect(
      field<{ children: { style: { text: string } }[] }[]>(plain, "graphic")[0].children[1].style.text,
    ).toBe("votos válidos");
  });
});

describe("evolution chart option", () => {
  const base = { colors, colorOf, topN: 6, showEvents: true, style: "linha" as const };
  type Line = {
    name: string;
    areaStyle?: { opacity: number };
    data: [number, number][];
    markLine?: { data: { xAxis: number; name: string; tooltip: { formatter: string } }[] };
  };

  it("is empty without points", () => {
    expect(
      buildEvolutionOption({ ...base, series: series({ points: [] }), axis: "t", metric: "pct" }),
    ).toBeNull();
  });

  it("draws one line per followed candidate, with the events as markers on the first line", () => {
    const option = buildEvolutionOption({
      ...base,
      series: series({
        events: [
          { id: 1, type: "lead_change", title: "Virada", occurred_at: "2026-10-04T18:30:00Z" } as never,
          { id: 2, type: "unknown_type", title: "Outro", occurred_at: "2026-10-04T18:45:00Z" } as never,
        ],
      }),
      axis: "t",
      metric: "pct",
    });
    const lines = field<Line[]>(option, "series");
    expect(lines.map((l) => l.name)).toEqual(["Maria Silva (13)", "João Souza (45)"]);
    expect(lines[0].markLine?.data).toHaveLength(2);
    expect(lines[0].markLine?.data[0].tooltip.formatter).toContain("Virada");
    expect(lines[0].markLine?.data[1].tooltip.formatter).toContain("<b>unknown_type</b>");
    expect(lines[1].markLine).toBeUndefined();
    expect(lines[0].areaStyle).toBeUndefined();
  });

  it("draws the difference between the first two candidates, with area style", () => {
    const option = buildEvolutionOption({
      ...base,
      series: series(),
      axis: "pct_secoes",
      metric: "diferenca",
      style: "area",
      showEvents: false,
    });
    const lines = field<Line[]>(option, "series");
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe("Maria Silva − João Souza");
    expect(lines[0].areaStyle?.opacity).toBe(0.15);
    expect(lines[0].data[0]).toEqual([10, 20]);
    const yAxis = field<{ axisLabel: { formatter: (v: number) => string } }>(option, "yAxis");
    expect(yAxis.axisLabel.formatter(12)).toBe("12 p.p.");
    const xAxis = field<{ max: number; axisLabel: { formatter: string } }>(option, "xAxis");
    expect(xAxis.max).toBe(100);
    expect(xAxis.axisLabel.formatter).toBe("{value}%");
  });

  it("formats votes by the million on the votes metric, and places events by section percentage", () => {
    const option = buildEvolutionOption({
      ...base,
      series: series({
        events: [{ id: 3, type: "milestone", title: "Marco", occurred_at: "2026-10-04T18:30:00Z" } as never],
      }),
      axis: "pct_secoes",
      metric: "votos",
    });
    const yAxis = field<{ axisLabel: { formatter: (v: number) => string } }>(option, "yAxis");
    expect(yAxis.axisLabel.formatter(2_500_000)).toBe("2,5 mi");
    const tooltip = field<{ valueFormatter: (v: unknown) => string }>(option, "tooltip");
    expect(tooltip.valueFormatter(1500)).toBe("1.500");
    expect(field<Line[]>(option, "series")[0].markLine?.data[0].xAxis).toBe(10);
  });

  it("formats the time axis in Brasília time and the percentage tooltip", () => {
    const option = buildEvolutionOption({ ...base, series: series(), axis: "t", metric: "pct" });
    const xAxis = field<{ axisLabel: { formatter: (v: number) => string } }>(option, "xAxis");
    expect(xAxis.axisLabel.formatter(Date.parse("2026-10-04T18:00:00Z"))).toBe("15:00");
    const tooltip = field<{ valueFormatter: (v: unknown) => string }>(option, "tooltip");
    expect(tooltip.valueFormatter(12.5)).toBe("12,5%");
  });
});

describe("state grid", () => {
  it("places each of the 27 states in its own cell of the cartogram", () => {
    const cells = Object.values(STATE_GRID).map(([column, row]) => `${column}:${row}`);
    expect(Object.keys(STATE_GRID)).toHaveLength(27);
    expect(new Set(cells).size).toBe(cells.length);
  });
});
