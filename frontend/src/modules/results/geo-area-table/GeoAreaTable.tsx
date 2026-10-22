import { Group, Pagination, ScrollArea, Stack, Table, Text } from "@mantine/core";
import type { ChildItemDto, Level } from "../../../api/models";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { fmtInt } from "../../../lib/formatting";
import { LEVEL_PLURAL_LABELS, asLevel } from "../../../lib/geo-areas";
import { GeoAreaTableHead } from "./GeoAreaHeader";
import { FilterPanel, FilterToolbar } from "./GeoAreaFilters";
import { GeoAreaRow, GroupRows } from "./GeoAreaRows";
import type { ColumnId } from "./geoAreaModel";
import { useGeoAreaTable } from "./useGeoAreaTable";

export { COLUMNS, DEFAULT_COLUMNS, type ColumnId } from "./geoAreaModel";

export interface GeoAreaTableProps {
  level?: Level;
  id?: string;
  childLevel?: Level | null;
  columns?: ColumnId[];
  topN?: number;
  onSelect?: (level: Level, id: string, name: string) => void;
  showFilters?: boolean;
  maxHeight?: number | string;
  pageSize?: number;
}

type TableState = ReturnType<typeof useGeoAreaTable>;

/** Toolbar and the collapsible filter panel above the table. */
function FilterBlock({ table }: { table: TableState }) {
  const candidates = table.query.data?.candidates ?? [];
  return (
    <>
      <FilterToolbar
        childLevelLabel={LEVEL_PLURAL_LABELS[table.listedLevel].toLowerCase()}
        search={table.search}
        onSearch={(search) => table.updateFilters({ search })}
        filtersOpen={table.filtersOpen}
        onToggleFilters={table.toggleFilters}
        activeCount={table.activeCount}
        groupBy={table.groupBy}
        onGroupBy={table.setGroupBy}
        hasStates={table.hasStates}
        onClear={table.clearFilters}
      />
      <FilterPanel
        open={table.filtersOpen}
        filters={table.filters}
        update={table.updateFilters}
        hasStates={table.hasStates}
        candidates={candidates}
      />
    </>
  );
}

/** Rows of the table: groups when grouping is on, else the current page. */
function TableBody({
  table,
  openItem,
}: {
  table: TableState;
  openItem: (item: ChildItemDto) => (() => void) | undefined;
}) {
  if (table.groups)
    return (
      <>
        {table.groups.map((group) => (
          <GroupRows
            key={group.key}
            group={group}
            open={!!table.openGroups[group.key]}
            onToggle={() => table.toggleGroup(group.key)}
            columns={table.columns}
            candidateColor={table.candidateColor}
            openItem={openItem}
          />
        ))}
      </>
    );
  return (
    <>
      {table.visibleRows.map((item) => (
        <GeoAreaRow
          key={item.id}
          item={item}
          columns={table.columns}
          candidateColor={table.candidateColor}
          onClick={openItem(item)}
        />
      ))}
    </>
  );
}

/** Table of the areas inside a level (its children): filters, grouping, sorting and pages. */
export function GeoAreaTable(props: GeoAreaTableProps) {
  const table = useGeoAreaTable({
    level: props.level,
    id: props.id,
    childLevel: props.childLevel,
    columns: props.columns,
    topN: props.topN,
    pageSize: props.pageSize,
  });
  const { query, listedLevel, columns } = table;
  const onSelect = props.onSelect;
  if (query.isLoading) return <Loading linhas={6} />;
  if (query.error) return <ErrorView erro={query.error} onRetry={() => query.refetch()} />;
  if (!query.data || query.data.items.length === 0)
    return <NoData titulo={`Sem ${LEVEL_PLURAL_LABELS[listedLevel].toLowerCase()} com dados`} />;

  const openItem = (item: ChildItemDto) =>
    onSelect ? () => onSelect(asLevel(item.level), item.id, item.name) : undefined;

  return (
    <Stack gap="xs">
      {(props.showFilters ?? true) && <FilterBlock table={table} />}
      <Text size="xs" c="dimmed">
        {fmtInt(table.rows.length)} de {fmtInt(query.data.items.length)}{" "}
        {LEVEL_PLURAL_LABELS[listedLevel].toLowerCase()}
      </Text>
      <ScrollArea.Autosize mah={props.maxHeight ?? 560} type="auto" className="scroll-fino">
        <Table
          highlightOnHover
          verticalSpacing={6}
          horizontalSpacing="xs"
          stickyHeader
          miw={columns.length * 95}
        >
          <GeoAreaTableHead columns={columns} sort={table.sort} onSort={table.sortBy} />
          <Table.Tbody>
            <TableBody table={table} openItem={openItem} />
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
      {!table.groups && table.pages > 1 && (
        <Group justify="center">
          <Pagination
            size="sm"
            total={table.pages}
            value={table.currentPage}
            onChange={table.setPage}
            siblings={1}
          />
        </Group>
      )}
    </Stack>
  );
}
