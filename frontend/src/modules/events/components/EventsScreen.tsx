import { Card, Group, MultiSelect, NumberInput, Stack, Switch, Text, Title } from "@mantine/core";
import { useState } from "react";
import { EventFeed, EVENT_TYPES } from "./EventFeed";
import { useFilter } from "../../../lib/filter-store";
import { usePrefs } from "../../../lib/prefs-store";
import { OFFICE_NAME } from "../../../lib/offices";
import { defaultGeoAreaName } from "../../../lib/geo-areas";

/** Events screen (`/eventos`): the feed with filters, and which event types pop up as notifications. */
export function EventsScreen() {
  const filter = useFilter();
  const [types, setTypes] = useState<string[]>([]);
  const [onlyOffice, setOnlyOffice] = useState(false);
  const [onlyGeoArea, setOnlyGeoArea] = useState(false);
  const [limit, setLimit] = useState(100);
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
            value={types}
            onChange={setTypes}
            clearable
            w={320}
          />
          <NumberInput
            label="Quantidade"
            value={limit}
            onChange={(v) => setLimit(Number(v) || 100)}
            min={10}
            max={500}
            step={50}
            w={120}
          />
          <Switch
            label={`Só ${OFFICE_NAME[filter.cargo] ?? "cargo atual"}`}
            checked={onlyOffice}
            onChange={(e) => setOnlyOffice(e.currentTarget.checked)}
          />
          <Switch
            label={`Só ${filter.nome ?? defaultGeoAreaName(filter.nivel, filter.id)}`}
            checked={onlyGeoArea}
            onChange={(e) => setOnlyGeoArea(e.currentTarget.checked)}
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
          tipos={types}
          limite={limit}
          cargo={onlyOffice ? filter.cargo : null}
          nivel={onlyGeoArea ? filter.nivel : null}
          id={onlyGeoArea ? filter.id : null}
        />
      </Card>
    </Stack>
  );
}
