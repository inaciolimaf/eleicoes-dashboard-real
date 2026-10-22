import { useMemo, useState } from "react";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import type { Level } from "../../../api/models";
import { useChildren } from "../hooks";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { useLive, topic } from "../../realtime";
import { REGIONS, asLevel, childLevel as childLevelOf } from "../../../lib/geo-areas";
import { useCandidateColor } from "../../../lib/useColor";
import {
  COLUMNS,
  DEFAULT_COLUMNS,
  DEFAULT_FILTERS,
  countActiveFilters,
  filterItems,
  groupItems,
  orderedGroupKeys,
  sortItems,
  type ColumnId,
  type GroupBy,
  type TableFilters,
} from "./geoAreaModel";

export interface GeoAreaTableOptions {
  level?: Level;
  id?: string;
  childLevel?: Level | null;
  columns?: ColumnId[];
  topN?: number;
  pageSize?: number;
}

/** State and derived rows of the areas table: filters, sort, page, grouping and the live query. */
export function useGeoAreaTable({
  level: levelProp,
  id: idProp,
  childLevel = null,
  columns: columnsProp,
  topN,
  pageSize = 50,
}: GeoAreaTableOptions) {
  const filter = useEffectiveFilter();
  const level = levelProp ?? filter.nivel;
  const id = idProp ?? filter.id;
  const query = useChildren({
    turno: filter.turno,
    cargo: filter.cargo,
    nivel: level,
    id,
    t: filter.t,
    childLevel,
  });
  useLive([topic.children(filter.turno, filter.cargo, level, id, childLevel)]);
  const candidateColor = useCandidateColor();

  const [filters, setFilters] = useState<TableFilters>(DEFAULT_FILTERS);
  const [debouncedSearch] = useDebouncedValue(filters.search, 200);
  const [sort, setSort] = useState<{ column: ColumnId; descending: boolean }>({
    column: "eleitorado",
    descending: true,
  });
  const [page, setPage] = useState(1);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [filtersOpen, { toggle: toggleFilters }] = useDisclosure(false);

  const listedLevel = asLevel(query.data?.child_level ?? childLevel ?? childLevelOf(level) ?? "municipality");
  const hasStates = listedLevel !== "state" && level === "country";
  const columns = useMemo(() => {
    const chosen = columnsProp?.length ? columnsProp : DEFAULT_COLUMNS;
    return hasStates && !chosen.includes("uf") ? [chosen[0], "uf" as const, ...chosen.slice(1)] : chosen;
  }, [columnsProp, hasStates]);

  const updateFilters = (patch: Partial<TableFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const rows = useMemo(() => {
    const matching = filterItems(query.data?.items ?? [], filters, debouncedSearch);
    const sorted = sortItems(matching, sort.column, sort.descending);
    return topN && topN > 0 ? sorted.slice(0, topN) : sorted;
  }, [query.data, debouncedSearch, filters, sort, topN]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const order = orderedGroupKeys(rows, groupBy, REGIONS);
    return groupItems(rows, groupBy, candidateColor, order);
  }, [groupBy, rows, candidateColor]);

  const activeCount = countActiveFilters(filters);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /** Clicking the sorted column flips the direction; a new numeric column starts descending. */
  const sortBy = (column: ColumnId) => {
    const numeric = !!COLUMNS.find((entry) => entry.id === column)?.num;
    setSort((current) => ({
      column,
      descending: current.column === column ? !current.descending : numeric,
    }));
  };

  return {
    query,
    level,
    id,
    childLevel,
    listedLevel,
    hasStates,
    columns,
    candidateColor,
    filters,
    updateFilters,
    clearFilters: () => updateFilters(DEFAULT_FILTERS),
    search: filters.search,
    debouncedSearch,
    filtersOpen,
    toggleFilters,
    activeCount,
    sort,
    sortBy,
    groupBy,
    setGroupBy,
    groups,
    openGroups,
    toggleGroup: (key: string) => setOpenGroups((current) => ({ ...current, [key]: !current[key] })),
    rows,
    visibleRows,
    pages,
    currentPage,
    setPage,
  };
}
