import { Card, Group, MultiSelect, NumberInput, Stack, Switch, Text, Title } from "@mantine/core";
import { useState } from "react";
import { EventFeed, EVENT_TYPES } from "./EventFeed";
import { useFilter } from "../../../lib/filter-store";
import { usePrefs } from "../../../lib/prefs-store";
import { OFFICE_NAME } from "../../../lib/offices";
import { defaultGeoAreaName } from "../../../lib/geo-areas";

export function EventsScreen() {
  const f = useFilter();
  const [tipos, setTipos] = useState<string[]>([]);
  const [soCargo, setSoCargo] = useState(false);
  const [soRecorte, setSoRecorte] = useState(false);
  const [limite, setLimite] = useState(100);
  const toasts = usePrefs((s) => s.toasts);
  const setPrefs = usePrefs((s) => s.set);
  return (
    <Stack gap="md" maw={980} mx="auto">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          Tempo real
        </Text>
        <Title order={2}>Eventos da apuração</Title>
      </Stack>
      <Card p="md">
        <Group gap="md" align="flex-end" wrap="wrap">
          <MultiSelect
            label="Tipos"
            placeholder="Todos"
            data={EVENT_TYPES}
            value={tipos}
            onChange={setTipos}
            clearable
            w={320}
          />
          <NumberInput
            label="Quantidade"
            value={limite}
            onChange={(v) => setLimite(Number(v) || 100)}
            min={10}
            max={500}
            step={50}
            w={120}
          />
          <Switch
            label={`Só ${OFFICE_NAME[f.cargo] ?? "cargo atual"}`}
            checked={soCargo}
            onChange={(e) => setSoCargo(e.currentTarget.checked)}
          />
          <Switch
            label={`Só ${f.nome ?? defaultGeoAreaName(f.nivel, f.id)}`}
            checked={soRecorte}
            onChange={(e) => setSoRecorte(e.currentTarget.checked)}
          />
        </Group>
        <MultiSelect
          mt="sm"
          label="Mostrar notificação (toast) para"
          description="Preferência salva neste navegador (e na conta, se estiver logado)"
          data={EVENT_TYPES}
          value={toasts}
          onChange={(v) => setPrefs({ toasts: v })}
          clearable
        />
      </Card>
      <Card p="md">
        <EventFeed
          tipos={tipos}
          limite={limite}
          cargo={soCargo ? f.cargo : null}
          nivel={soRecorte ? f.nivel : null}
          id={soRecorte ? f.id : null}
        />
      </Card>
    </Stack>
  );
}
