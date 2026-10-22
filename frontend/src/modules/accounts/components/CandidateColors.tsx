import { Button, Card, ColorInput, Group, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useCandidates } from "../../results";
import { CandidateAvatar } from "../../results";
import { OFFICE_NAME } from "../../../lib/offices";
import { PALETTE } from "../../../lib/palettes";
import { stateOfId } from "../../../lib/geo-areas";
import { useFilter } from "../../../lib/filter-store";
import { usePrefs } from "../../../lib/prefs-store";

const MAX_ROWS = 80;

/** Card that lets the user pick a color for each candidate of the current office. */
export function CandidateColors() {
  const filter = useFilter();
  const candidates = useCandidates(
    filter.turno,
    filter.cargo,
    filter.cargo === 1 ? null : (stateOfId(filter.nivel, filter.id) ?? "sp"),
  );
  const colors = usePrefs((s) => s.coresCandidatos);
  const setColor = usePrefs((s) => s.setCor);
  return (
    <Card p="md">
      <Group justify="space-between" mb="xs">
        <Stack gap={0}>
          <Text fw={700}>Cor por candidato</Text>
          <Text size="xs" c="dimmed">
            {OFFICE_NAME[filter.cargo]} · paleta neutra por padrão. Vale para todos os placares, mapas e
            gráficos.
          </Text>
        </Stack>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconRestore size={14} />}
          onClick={() => usePrefs.getState().set({ coresCandidatos: {} })}
        >
          Restaurar padrão
        </Button>
      </Group>
      <ScrollArea.Autosize mah={420} className="scroll-fino">
        <Table verticalSpacing={4}>
          <Table.Tbody>
            {(candidates.data ?? []).slice(0, MAX_ROWS).map((candidate) => (
              <Table.Tr key={candidate.tse_candidate_id}>
                <Table.Td w={50}>
                  <CandidateAvatar
                    fotoUrl={candidate.photo_url}
                    nome={candidate.ballot_name}
                    cor={colors[candidate.tse_candidate_id] ?? candidate.color}
                    size={32}
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {candidate.ballot_name} ({candidate.ballot_number})
                  </Text>
                  <Text size="xs" c="dimmed">
                    {candidate.party_abbreviation}
                  </Text>
                </Table.Td>
                <Table.Td w={170}>
                  <ColorInput
                    size="xs"
                    value={colors[candidate.tse_candidate_id] ?? candidate.color}
                    onChange={(value) => setColor(candidate.tse_candidate_id, value || null)}
                    swatches={PALETTE}
                    swatchesPerRow={6}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Card>
  );
}
