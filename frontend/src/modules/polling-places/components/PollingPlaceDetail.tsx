import {
  Anchor,
  Badge,
  Box,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconMapPin } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { usePollingPlace } from "../hooks";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { STATUS_COLORS, STATUS_LABELS } from "../../../lib/palettes";
import { fmtInt } from "../../../lib/formatting";
import { fmtTime } from "../../../lib/time";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { ElectoralMap } from "../../maps";
import type { PollingPlaceDto, TallyStatus } from "../../../api/models";

/** Colored dot and label of a tally status. */
export function BadgeStatus({ status }: { status: TallyStatus }) {
  return (
    <Badge
      size="sm"
      variant="light"
      color={status === "tallied" ? "green" : status === "partial" ? "yellow" : "gray"}
      leftSection={<Box w={6} h={6} style={{ borderRadius: 6, background: STATUS_COLORS[status] }} />}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function PlaceHeader({ place }: { place: PollingPlaceDto }) {
  return (
    <Stack gap={2}>
      <Text fw={800} size="lg" lh={1.2}>
        {place.name}
      </Text>
      <Group gap={4} wrap="nowrap">
        <IconMapPin size={14} style={{ flexShrink: 0 }} />
        <Text size="sm" c="dimmed">
          {[place.address, place.neighborhood, place.zip_code].filter(Boolean).join(" · ") ||
            "Endereço não informado"}
          {place.approximate ? " (posição aproximada)" : ""}
        </Text>
      </Group>
      <Text size="sm">
        <Anchor component={Link} to={`/explorar/municipio/${place.municipality.id}`}>
          {place.municipality.name}
        </Anchor>{" "}
        ·{" "}
        <Anchor component={Link} to={`/explorar/zona/${place.zone.id}`}>
          Zona {place.zone.number}
        </Anchor>{" "}
        · <span className="num">{fmtInt(place.eligible_voters)}</span> eleitores aptos
      </Text>
    </Stack>
  );
}

function SectionsTable({ place, listHeight }: { place: PollingPlaceDto; listHeight?: number | string }) {
  const tallied = place.sections.filter((s) => s.status === "tallied").length;
  return (
    <Stack gap={4}>
      <Group justify="space-between">
        <Text size="sm" fw={700}>
          Seções ({place.sections.length})
        </Text>
        <Text size="xs" c="dimmed">
          {tallied} de {place.sections.length} apuradas
        </Text>
      </Group>
      <ScrollArea.Autosize mah={listHeight ?? 260} className="scroll-fino" type="auto">
        <Table verticalSpacing={4} highlightOnHover fz="sm" miw={380}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Seção</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th ta="right">Aptos</Table.Th>
              <Table.Th ta="right">Comparec.</Table.Th>
              <Table.Th ta="right">BU</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {[...place.sections]
              .sort((a, b) => a.number - b.number)
              .map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/secoes/${s.id}`} fw={700} className="num">
                      {s.number}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Box
                        w={8}
                        h={8}
                        style={{ borderRadius: 8, background: STATUS_COLORS[s.status], flexShrink: 0 }}
                      />
                      <Text size="xs" style={{ whiteSpace: "nowrap" }}>
                        {STATUS_LABELS[s.status]}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right" className="num">
                    {fmtInt(s.eligible_voters)}
                  </Table.Td>
                  <Table.Td ta="right" className="num">
                    {fmtInt(s.turnout)}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Tooltip label="Horário de totalização do boletim de urna (Brasília)">
                      <Text size="xs" className="num" c="dimmed">
                        {fmtTime(s.tallied_at, false)}
                      </Text>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Stack>
  );
}

/** Polling place card: address, municipality and zone links, the map and the sections table. */
export function PollingPlaceDetail({
  localId,
  showMap = true,
  alturaLista,
}: {
  localId: string | null | undefined;
  showMap?: boolean;
  alturaLista?: number | string;
}) {
  const filter = useEffectiveFilter();
  const query = usePollingPlace(localId, filter.turno);
  if (!localId)
    return <NoData titulo="Escolha um local de votação">Use a busca (Ctrl+K) ou configure o widget.</NoData>;
  if (query.isLoading) return <Loading linhas={4} />;
  if (query.error) return <ErrorView erro={query.error} onRetry={() => query.refetch()} />;
  const place = query.data;
  if (!place) return <NoData />;
  return (
    <Stack gap="sm">
      <PlaceHeader place={place} />
      <SimpleGrid cols={{ base: 1, xl: showMap ? 2 : 1 }} spacing="sm">
        {showMap && (
          <Box
            h={220}
            style={{
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <ElectoralMap tipo="locais" nivel="polling_place" id={place.id} legenda={false} altura={220} />
          </Box>
        )}
        <SectionsTable place={place} listHeight={alturaLista} />
      </SimpleGrid>
    </Stack>
  );
}
