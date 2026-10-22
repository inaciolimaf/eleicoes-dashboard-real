import {
  Button,
  Card,
  ColorInput,
  Group,
  MultiSelect,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useCandidates } from "../../results";
import { CandidateAvatar } from "../../results";
import { EVENT_TYPES } from "../../events";
import { OFFICE_NAME } from "../../../lib/offices";
import { PALETTE } from "../../../lib/palettes";
import { stateOfId } from "../../../lib/geo-areas";
import { useAuth } from "../../../lib/auth-store";
import { useFilter } from "../../../lib/filter-store";
import { DEFAULT_PREFS, usePrefs, type Density, type Theme } from "../../../lib/prefs-store";
import { useUi } from "../../../lib/ui-store";

function CoresCandidatos() {
  const f = useFilter();
  const q = useCandidates(f.turno, f.cargo, f.cargo === 1 ? null : (stateOfId(f.nivel, f.id) ?? "sp"));
  const cores = usePrefs((s) => s.coresCandidatos);
  const setCor = usePrefs((s) => s.setCor);
  return (
    <Card p="md">
      <Group justify="space-between" mb="xs">
        <Stack gap={0}>
          <Text fw={700}>Cor por candidato</Text>
          <Text size="xs" c="dimmed">
            {OFFICE_NAME[f.cargo]} · paleta neutra por padrão. Vale para todos os placares, mapas e gráficos.
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
            {(q.data ?? []).slice(0, 80).map((c) => (
              <Table.Tr key={c.tse_candidate_id}>
                <Table.Td w={50}>
                  <CandidateAvatar
                    fotoUrl={c.photo_url}
                    nome={c.ballot_name}
                    cor={cores[c.tse_candidate_id] ?? c.color}
                    size={32}
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {c.ballot_name} ({c.ballot_number})
                  </Text>
                  <Text size="xs" c="dimmed">
                    {c.party_abbreviation}
                  </Text>
                </Table.Td>
                <Table.Td w={170}>
                  <ColorInput
                    size="xs"
                    value={cores[c.tse_candidate_id] ?? c.color}
                    onChange={(v) => setCor(c.tse_candidate_id, v || null)}
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

export function AccountScreen() {
  const p = usePrefs();
  const user = useAuth((s) => s.user);
  const setAuth = useUi((s) => s.setAuthAberto);
  return (
    <Stack gap="md" maw={900} mx="auto">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          {user ? `${user.name} · ${user.email}` : "Sem login (preferências salvas neste navegador)"}
        </Text>
        <Title order={2}>Preferências</Title>
      </Stack>
      {!user && (
        <Button w="fit-content" variant="light" onClick={() => setAuth(true)}>
          Entrar para sincronizar preferências
        </Button>
      )}
      <Card p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Tema</Text>
            <SegmentedControl
              value={p.tema}
              onChange={(v) => p.set({ tema: v as Theme })}
              data={[
                { value: "escuro", label: "Noite da eleição" },
                { value: "claro", label: "Claro" },
                { value: "auto", label: "Automático" },
              ]}
            />
          </Group>
          <Group justify="space-between">
            <Text fw={600}>Densidade</Text>
            <SegmentedControl
              value={p.densidade}
              onChange={(v) => p.set({ densidade: v as Density })}
              data={[
                { value: "confortavel", label: "Confortável" },
                { value: "compacta", label: "Compacta" },
              ]}
            />
          </Group>
          <Switch
            label="Animações (números que rolam, ranking que reordena, brilho nas mudanças)"
            checked={p.animacoes}
            onChange={(e) => p.set({ animacoes: e.currentTarget.checked })}
          />
          <Switch
            label="Mapa de fundo (ruas e rótulos) nos mapas"
            checked={p.basemap}
            onChange={(e) => p.set({ basemap: e.currentTarget.checked })}
          />
          <MultiSelect
            label="Toasts para eventos"
            data={EVENT_TYPES}
            value={p.toasts}
            onChange={(v) => p.set({ toasts: v })}
            clearable
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconRestore size={14} />}
              onClick={() => p.set({ ...DEFAULT_PREFS, coresCandidatos: p.coresCandidatos })}
            >
              Restaurar preferências
            </Button>
          </Group>
        </Stack>
      </Card>
      <CoresCandidatos />
    </Stack>
  );
}
