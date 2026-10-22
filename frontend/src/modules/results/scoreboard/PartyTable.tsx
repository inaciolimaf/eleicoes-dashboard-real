import { Box, Group, Stack, Table, Text } from "@mantine/core";
import type { ResultsWithDataDto } from "../../../api/models";
import { Num } from "../../../components/Num";
import { fmtInt, fmtPct } from "../../../lib/formatting";

/** Alliances by seats, then votes. */
function sortAlliances(result: ResultsWithDataDto) {
  return [...result.alliances].sort((a, b) => (b.seats ?? 0) - (a.seats ?? 0) || b.votes - a.votes);
}

/** Parties and federations of a proportional office: votes, share and seats. */
export function PartyTable({ result }: { result: ResultsWithDataDto }) {
  const alliances = sortAlliances(result);
  const totalVotes = alliances.reduce((sum, alliance) => sum + alliance.votes, 0);
  return (
    <Table striped highlightOnHover verticalSpacing={4} fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Partido / Federação</Table.Th>
          <Table.Th ta="right">Votos</Table.Th>
          <Table.Th ta="right">%</Table.Th>
          <Table.Th ta="right">Vagas</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {alliances.map((alliance) => (
          <Table.Tr key={alliance.name}>
            <Table.Td>
              <Group gap={6} wrap="nowrap">
                <Box w={10} h={10} style={{ borderRadius: 3, background: alliance.color, flexShrink: 0 }} />
                <Stack gap={0}>
                  <Text size="sm" fw={600} lineClamp={1}>
                    {alliance.name}
                  </Text>
                  {alliance.parties.length > 1 && (
                    <Text size="xs" c="dimmed">
                      {alliance.parties.join(" · ")}
                    </Text>
                  )}
                </Stack>
              </Group>
            </Table.Td>
            <Table.Td ta="right" className="num">
              {fmtInt(alliance.votes)}
            </Table.Td>
            <Table.Td ta="right" className="num">
              {fmtPct(totalVotes ? (alliance.votes / totalVotes) * 100 : null)}
            </Table.Td>
            <Table.Td ta="right">
              <Num value={alliance.seats} style={{ fontWeight: 700 }} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
