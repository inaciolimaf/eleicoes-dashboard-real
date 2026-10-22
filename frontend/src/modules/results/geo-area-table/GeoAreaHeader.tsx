import { Table, Text, UnstyledButton } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconArrowsSort } from "@tabler/icons-react";
import { COLUMNS, type ColumnId } from "./geoAreaModel";

interface SortState {
  column: ColumnId;
  descending: boolean;
}

function SortIcon({ active, descending }: { active: boolean; descending: boolean }) {
  if (!active) return <IconArrowsSort size={12} opacity={0.4} />;
  return descending ? <IconArrowDown size={12} /> : <IconArrowUp size={12} />;
}

/** Sticky header: each column sorts the table when clicked. */
export function GeoAreaTableHead({
  columns,
  sort,
  onSort,
}: {
  columns: ColumnId[];
  sort: SortState;
  onSort: (column: ColumnId) => void;
}) {
  return (
    <Table.Thead style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--mantine-color-body)" }}>
      <Table.Tr>
        {columns.map((column) => {
          const meta = COLUMNS.find((entry) => entry.id === column) ?? COLUMNS[0];
          const active = sort.column === column;
          return (
            <Table.Th key={column} style={{ whiteSpace: "nowrap" }}>
              <UnstyledButton
                onClick={() => onSort(column)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginLeft: meta.num ? "auto" : undefined,
                }}
              >
                <Text size="xs" fw={700} tt="uppercase" c={active ? undefined : "dimmed"}>
                  {meta.label}
                </Text>
                <SortIcon active={active} descending={sort.descending} />
              </UnstyledButton>
            </Table.Th>
          );
        })}
      </Table.Tr>
    </Table.Thead>
  );
}
