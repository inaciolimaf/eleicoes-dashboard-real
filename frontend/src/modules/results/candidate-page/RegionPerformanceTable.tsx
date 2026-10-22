import { Box, Group, Pagination, Progress, ScrollArea, Stack, Table, Text, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChildren } from "../hooks";
import type { ChildItemDto, Level } from "../../../api/models";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { fmtInt, fmtPct, stripAccents } from "../../../lib/formatting";
import { asLevel, geoAreaLink, LEVEL_PLURAL_LABELS } from "../../../lib/geo-areas";
import { useCandidateColor } from "../../../lib/useColor";
import { useFilter } from "../../../lib/filter-store";

/** Rows per page of the table. */
const PAGE_SIZE = 15;

/** Areas of the table, best result for the candidate first, filtered by name. */
function rankedItems(items: ChildItemDto[], candidateId: string, search: string): ChildItemDto[] {
  const needle = stripAccents(search);
  return [...items]
    .filter((item) => !needle || stripAccents(item.name).includes(needle))
    .sort((a, b) => (b.values?.[candidateId] ?? -1) - (a.values?.[candidateId] ?? -1));
}

/** One area: the candidate's share with its bar, the leader and the tallied share. */
function RegionRow({ item, candidateId }: { item: ChildItemDto; candidateId: string }) {
  const navigate = useNavigate();
  const candidateColor = useCandidateColor();
  const value = item.values?.[candidateId];
  const isLeader = item.leader?.tse_candidate_id === candidateId;
  const open = () => {
    useFilter.getState().setRecorte(asLevel(item.level), item.id, item.name);
    navigate(geoAreaLink(asLevel(item.level), item.id));
  };
  return (
    <Table.Tr style={{ cursor: "pointer" }} onClick={open}>
      <Table.Td fw={600}>
        {item.name}
        {item.level === "municipality" ? (
          <Text span c="dimmed" size="xs">
            {" "}
            · {(item.state_code ?? "").toUpperCase()}
          </Text>
        ) : null}
      </Table.Td>
      <Table.Td ta="right">
        <Stack gap={2} align="flex-end">
          <Text size="sm" className="num" fw={isLeader ? 800 : 500}>
            {fmtPct(value)}
          </Text>
          <Progress value={value ?? 0} size={4} w={90} color={candidateColor(candidateId, undefined)} />
        </Stack>
      </Table.Td>
      <Table.Td>
        {item.leader ? (
          <Group gap={6} wrap="nowrap">
            <Box
              w={8}
              h={8}
              style={{
                borderRadius: 8,
                background: candidateColor(item.leader.tse_candidate_id, item.leader.color),
              }}
            />
            <Text size="sm" fw={isLeader ? 700 : 400}>
              {item.leader.ballot_name}
            </Text>
          </Group>
        ) : (
          "—"
        )}
      </Table.Td>
      <Table.Td ta="right" className="num">
        {fmtPct(item.pct_sections, 1)}
      </Table.Td>
    </Table.Tr>
  );
}

function RegionTable({
  items,
  candidateId,
  childLevel,
  page,
  onPageChange,
}: {
  items: ChildItemDto[];
  candidateId: string;
  childLevel: Level;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  return (
    <>
      <ScrollArea>
        <Table highlightOnHover verticalSpacing={4} fz="sm" miw={480}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{childLevel === "state" ? "UF" : "Município"}</Table.Th>
              <Table.Th ta="right">% do candidato</Table.Th>
              <Table.Th>Líder</Table.Th>
              <Table.Th ta="right">% apurado</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((item) => (
              <RegionRow key={item.id} item={item} candidateId={candidateId} />
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {pages > 1 && <Pagination size="sm" total={pages} value={current} onChange={onPageChange} />}
    </>
  );
}

/** Table of the areas where the candidate did best, with a name filter and pages of 15. */
export function RegionPerformanceTable({
  candidateId,
  level,
  id,
  childLevel,
}: {
  candidateId: string;
  level: Level;
  id: string;
  childLevel: Level | null;
}) {
  const filter = useEffectiveFilter();
  const query = useChildren({
    turno: filter.turno,
    cargo: filter.cargo,
    nivel: level,
    id,
    t: filter.t,
    childLevel,
    candidates: [candidateId],
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const items = useMemo(
    () => rankedItems(query.data?.items ?? [], candidateId, search),
    [query.data, search, candidateId],
  );
  if (query.isLoading) return <Loading rows={5} />;
  if (query.error) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  if (!items.length && !search) return <NoData />;
  const wins = query.data?.candidates.find((c) => c.tse_candidate_id === candidateId)?.wins ?? 0;
  const childLevelShown = asLevel(query.data?.child_level ?? "state");
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm">
          Venceu em <b className="num">{fmtInt(wins)}</b> de {fmtInt(query.data?.items.length ?? 0)}{" "}
          {LEVEL_PLURAL_LABELS[childLevelShown].toLowerCase()}
        </Text>
        <TextInput
          size="xs"
          placeholder="Filtrar…"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          w={180}
        />
      </Group>
      <RegionTable
        items={items}
        candidateId={candidateId}
        childLevel={childLevelShown}
        page={page}
        onPageChange={setPage}
      />
    </Stack>
  );
}
