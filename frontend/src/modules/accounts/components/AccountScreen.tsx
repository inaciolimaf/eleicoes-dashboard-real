import {
  Button,
  Card,
  Group,
  MultiSelect,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { EVENT_TYPES } from "../../events";
import { useAuth } from "../../../lib/auth-store";
import { DEFAULT_PREFS, usePrefs, type Density, type Theme } from "../../../lib/prefs-store";
import { useUi } from "../../../lib/ui-store";
import { CandidateColors } from "./CandidateColors";

const THEME_OPTIONS = [
  { value: "escuro", label: "Noite da eleição" },
  { value: "claro", label: "Claro" },
  { value: "auto", label: "Automático" },
];
const DENSITY_OPTIONS = [
  { value: "confortavel", label: "Confortável" },
  { value: "compacta", label: "Compacta" },
];

/** Preferences screen (`/conta`): theme, density, animations, base map, event toasts and candidate colors. */
export function AccountScreen() {
  const prefs = usePrefs();
  const user = useAuth((s) => s.user);
  const openAuth = useUi((s) => s.setAuthAberto);
  return (
    <Stack gap="md" maw={900} mx="auto">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          {user ? `${user.name} · ${user.email}` : "Sem login (preferências salvas neste navegador)"}
        </Text>
        <Title order={2}>Preferências</Title>
      </Stack>
      {!user && (
        <Button w="fit-content" variant="light" onClick={() => openAuth(true)}>
          Entrar para sincronizar preferências
        </Button>
      )}
      <Card p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Tema</Text>
            <SegmentedControl
              value={prefs.tema}
              onChange={(value) => prefs.set({ tema: value as Theme })}
              data={THEME_OPTIONS}
            />
          </Group>
          <Group justify="space-between">
            <Text fw={600}>Densidade</Text>
            <SegmentedControl
              value={prefs.densidade}
              onChange={(value) => prefs.set({ densidade: value as Density })}
              data={DENSITY_OPTIONS}
            />
          </Group>
          <Switch
            label="Animações (números que rolam, ranking que reordena, brilho nas mudanças)"
            checked={prefs.animacoes}
            onChange={(event) => prefs.set({ animacoes: event.currentTarget.checked })}
          />
          <Switch
            label="Mapa de fundo (ruas e rótulos) nos mapas"
            checked={prefs.basemap}
            onChange={(event) => prefs.set({ basemap: event.currentTarget.checked })}
          />
          <MultiSelect
            label="Toasts para eventos"
            data={EVENT_TYPES}
            value={prefs.toasts}
            onChange={(value) => prefs.set({ toasts: value })}
            clearable
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconRestore size={14} />}
              onClick={() => prefs.set({ ...DEFAULT_PREFS, coresCandidatos: prefs.coresCandidatos })}
            >
              Restaurar preferências
            </Button>
          </Group>
        </Stack>
      </Card>
      <CandidateColors />
    </Stack>
  );
}
