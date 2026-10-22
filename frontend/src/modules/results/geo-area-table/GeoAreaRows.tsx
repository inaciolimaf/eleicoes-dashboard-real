import { Badge, Button, Group, Table, Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import type { ChildItemDto } from "../../../api/models";
import { fmtCompact, fmtInt, fmtPct } from "../../../lib/formatting";
import { useFlash } from "../../../components/Num";
import { GeoAreaCell } from "./GeoAreaCells";
import type { CandidateColorOf, ColumnId, RowGroup } from "./geoAreaModel";

/** Rows of a group shown before the "show more" button. */
const FIRST_ROWS = 100;
/** Rows added by each "show more" click. */
const ROWS_PER_CLICK = 200;

/** One area of the table. Flashes when its numbers change. */
export function GeoAreaRow({
  item,
  columns,
  candidateColor,
  onClick,
}: {
  item: ChildItemDto;
  columns: ColumnId[];
  candidateColor: CandidateColorOf;
  onClick?: () => void;
}) {
  const flash = useFlash(`${item.pct_sections}|${item.leader?.tse_candidate_id}|${item.valid_votes}`);
  return (
    <Table.Tr
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : undefined }}
      className={flash ? "glow" : undefined}
    >
      {columns.map((column) => (
        <Table.Td key={column}>
          <GeoAreaCell item={item} column={column} candidateColor={candidateColor} />
        </Table.Td>
      ))}
    </Table.Tr>
  );
}

/** Header row of a group: a toggle with the count, the totals and the top winners. */
function GroupHeader({
  group,
  open,
  columnCount,
  onToggle,
}: {
  group: RowGroup;
  open: boolean;
  columnCount: number;
  onToggle: () => void;
}) {
  return (
    <Table.Tr
      onClick={onToggle}
      style={{ cursor: "pointer", background: "var(--mantine-color-default-hover)" }}
    >
      <Table.Td colSpan={columnCount}>
        <Group gap="sm" wrap="wrap">
          {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Text fw={700} size="sm">
            {group.key}
          </Text>
          <Text size="xs" c="dimmed">
            {fmtInt(group.items.length)} itens · {fmtCompact(group.electorate)} eleitores ·{" "}
            {fmtPct(group.pct, 1)} apurado · {fmtCompact(group.valid)} válidos
          </Text>
          <Group gap={4}>
            {group.winners.map((winner) => (
              <Badge key={winner.name} size="xs" variant="dot" color={winner.color}>
                {winner.name} {winner.count}
              </Badge>
            ))}
          </Group>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

/** A group of rows, expandable; long groups show `FIRST_ROWS` rows and grow on request. */
export function GroupRows({
  group,
  open,
  onToggle,
  columns,
  candidateColor,
  openItem,
}: {
  group: RowGroup;
  open: boolean;
  onToggle: () => void;
  columns: ColumnId[];
  candidateColor: CandidateColorOf;
  openItem: (item: ChildItemDto) => (() => void) | undefined;
}) {
  const [limit, setLimit] = useState(FIRST_ROWS);
  return (
    <>
      <GroupHeader group={group} open={open} columnCount={columns.length} onToggle={onToggle} />
      {open &&
        group.items
          .slice(0, limit)
          .map((item) => (
            <GeoAreaRow
              key={item.id}
              item={item}
              columns={columns}
              candidateColor={candidateColor}
              onClick={openItem(item)}
            />
          ))}
      {open && group.items.length > limit && (
        <Table.Tr>
          <Table.Td colSpan={columns.length}>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => setLimit((current) => current + ROWS_PER_CLICK)}
            >
              Mostrar mais ({fmtInt(group.items.length - limit)} restantes)
            </Button>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}
