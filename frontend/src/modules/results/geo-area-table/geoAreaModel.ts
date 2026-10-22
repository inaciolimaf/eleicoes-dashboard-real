import type { ChildItemDto } from "../../../api/models";
import { stripAccents } from "../../../lib/formatting";

/** Column ids are stored in the dashboards' config ("colunas"): they are kept as they are. */
export type ColumnId =
  | "nome"
  | "uf"
  | "regiao"
  | "pct_secoes"
  | "lider"
  | "segundo"
  | "margem_pp"
  | "votos_validos"
  | "eleitorado"
  | "comparecimento"
  | "abstencao"
  | "capital"
  | "partido";

export const COLUMNS: { id: ColumnId; label: string; num?: boolean }[] = [
  { id: "nome", label: "Nome" },
  { id: "uf", label: "UF" },
  { id: "regiao", label: "Região" },
  { id: "pct_secoes", label: "% apurado", num: true },
  { id: "lider", label: "Vencedor" },
  { id: "segundo", label: "2º colocado" },
  { id: "margem_pp", label: "Margem", num: true },
  { id: "votos_validos", label: "Votos válidos", num: true },
  { id: "eleitorado", label: "Eleitorado", num: true },
  { id: "comparecimento", label: "Comparec.", num: true },
  { id: "abstencao", label: "Abstenção", num: true },
  { id: "capital", label: "Capital" },
  { id: "partido", label: "Partido + votado" },
];

export const DEFAULT_COLUMNS: ColumnId[] = [
  "nome",
  "pct_secoes",
  "lider",
  "margem_pp",
  "votos_validos",
  "eleitorado",
];

/** Value a column sorts by: a number, or the text (compared in Portuguese). */
export function sortValue(item: ChildItemDto, column: ColumnId): number | string {
  switch (column) {
    case "nome":
      return stripAccents(item.name);
    case "uf":
      return item.state_code ?? "";
    case "regiao":
      return item.region ?? "";
    case "pct_secoes":
      return item.pct_sections;
    case "lider":
      return item.leader?.ballot_name ?? "";
    case "segundo":
      return item.second?.ballot_name ?? "";
    case "margem_pp":
      return item.margin_pp ?? -1;
    case "votos_validos":
      return item.valid_votes;
    case "eleitorado":
      return item.electorate;
    case "comparecimento":
      return item.electorate ? item.turnout / item.electorate : 0;
    case "abstencao":
      return item.pct_abstention;
    case "capital":
      return item.is_capital ? 1 : 0;
    case "partido":
      return item.leader_party?.abbreviation ?? "";
  }
}

/** Size bands of the electorate, for grouping by "porte". */
export const SIZE_BANDS = [
  { upTo: 10_000, label: "Até 10 mil eleitores" },
  { upTo: 50_000, label: "10 mil – 50 mil" },
  { upTo: 200_000, label: "50 mil – 200 mil" },
  { upTo: 1_000_000, label: "200 mil – 1 milhão" },
  { upTo: Infinity, label: "Mais de 1 milhão" },
];

export function sizeBandOf(electorate: number): string {
  return (SIZE_BANDS.find((band) => electorate < band.upTo) ?? SIZE_BANDS[SIZE_BANDS.length - 1]).label;
}

export type GroupBy = "none" | "region" | "state" | "size";

export interface TableFilters {
  search: string;
  states: string[];
  regions: string[];
  /** share of the sections tallied, in percent */
  tallied: [number, number];
  winner: string | null;
  /** margin between the first two, in percentage points */
  margin: [number, number];
  capital: "all" | "capital" | "inland";
  minElectorate: number | null;
}

export const DEFAULT_FILTERS: TableFilters = {
  search: "",
  states: [],
  regions: [],
  tallied: [0, 100],
  winner: null,
  margin: [0, 100],
  capital: "all",
  minElectorate: null,
};

/** Rows that match every filter; the name search ignores accents and case. */
export function filterItems(items: ChildItemDto[], filters: TableFilters, search: string): ChildItemDto[] {
  const needle = stripAccents(search.trim());
  return items.filter((item) => {
    if (needle && !stripAccents(item.name).includes(needle)) return false;
    if (filters.states.length && !filters.states.includes(item.state_code ?? "")) return false;
    if (filters.regions.length && !filters.regions.includes(item.region ?? "")) return false;
    if (item.pct_sections < filters.tallied[0] || item.pct_sections > filters.tallied[1]) return false;
    if (filters.winner && item.leader?.tse_candidate_id !== filters.winner) return false;
    if (filters.margin[0] > 0 || filters.margin[1] < 100) {
      const margin = item.margin_pp ?? 0;
      if (margin < filters.margin[0] || margin > filters.margin[1]) return false;
    }
    if (filters.capital === "capital" && !item.is_capital) return false;
    if (filters.capital === "inland" && item.is_capital) return false;
    if (filters.minElectorate && item.electorate < filters.minElectorate) return false;
    return true;
  });
}

/** Sorted copy of the rows, by a column, ascending or descending. */
export function sortItems(items: ChildItemDto[], column: ColumnId, descending: boolean): ChildItemDto[] {
  const direction = descending ? -1 : 1;
  return [...items].sort((a, b) => {
    const va = sortValue(a, column);
    const vb = sortValue(b, column);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * direction;
    return String(va).localeCompare(String(vb), "pt-BR") * direction;
  });
}

/** How many filters are changed from their default (the badge on the Filters button). */
export function countActiveFilters(filters: TableFilters): number {
  return (
    (filters.states.length ? 1 : 0) +
    (filters.regions.length ? 1 : 0) +
    (filters.tallied[0] > 0 || filters.tallied[1] < 100 ? 1 : 0) +
    (filters.winner ? 1 : 0) +
    (filters.margin[0] > 0 || filters.margin[1] < 100 ? 1 : 0) +
    (filters.capital !== "all" ? 1 : 0) +
    (filters.minElectorate ? 1 : 0)
  );
}

/** A group of rows, with the totals shown on its header. */
export interface RowGroup {
  key: string;
  items: ChildItemDto[];
  electorate: number;
  pct: number;
  valid: number;
  winners: { name: string; color: string; count: number }[];
}

function groupKeyOf(item: ChildItemDto, groupBy: Exclude<GroupBy, "none">): string {
  if (groupBy === "region") return item.region ?? "—";
  if (groupBy === "state") return (item.state_code ?? "").toUpperCase();
  return sizeBandOf(item.electorate);
}

/** Totals of one group: electorate, tallied share (weighted by electorate), valid votes and the top winners. */
function summarize(key: string, items: ChildItemDto[], candidateColor: CandidateColorOf): RowGroup {
  const electorate = items.reduce((sum, item) => sum + item.electorate, 0);
  const weightedSections = items.reduce((sum, item) => sum + item.pct_sections * item.electorate, 0);
  const wins = new Map<string, { name: string; color: string; count: number }>();
  for (const item of items) {
    if (!item.leader) continue;
    const found = wins.get(item.leader.tse_candidate_id);
    if (found) found.count++;
    else
      wins.set(item.leader.tse_candidate_id, {
        name: item.leader.ballot_name,
        color: candidateColor(item.leader.tse_candidate_id, item.leader.color),
        count: 1,
      });
  }
  return {
    key,
    items,
    electorate,
    pct: electorate ? weightedSections / electorate : 0,
    valid: items.reduce((sum, item) => sum + item.valid_votes, 0),
    winners: [...wins.values()].sort((a, b) => b.count - a.count).slice(0, 3),
  };
}

export type CandidateColorOf = (id: string, color?: string) => string;

/** Rows grouped by region, state or size band, in the order of the group's own list, then the rest. */
export function groupItems(
  items: ChildItemDto[],
  groupBy: Exclude<GroupBy, "none">,
  candidateColor: CandidateColorOf,
  orderedKeys: string[],
): RowGroup[] {
  const byKey = new Map<string, ChildItemDto[]>();
  for (const item of items) {
    const key = groupKeyOf(item, groupBy);
    const list = byKey.get(key);
    if (list) list.push(item);
    else byKey.set(key, [item]);
  }
  const keysInOrder = orderedKeys.filter((key) => byKey.has(key));
  const restKeys = [...byKey.keys()].filter((key) => !orderedKeys.includes(key));
  return [...keysInOrder, ...restKeys].map((key) => summarize(key, byKey.get(key) ?? [], candidateColor));
}

/** Keys in their display order: the size bands, the regions, or the states sorted. */
export function orderedGroupKeys(
  items: ChildItemDto[],
  groupBy: Exclude<GroupBy, "none">,
  regions: string[],
): string[] {
  if (groupBy === "size") return SIZE_BANDS.map((band) => band.label);
  if (groupBy === "region") return regions;
  return [...new Set(items.map((item) => groupKeyOf(item, "state")))].sort();
}
