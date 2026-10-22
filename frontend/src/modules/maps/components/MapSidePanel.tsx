import { ActionIcon, Card, Group, Stack, Switch, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconArrowUp, IconCompass } from "@tabler/icons-react";
import type { ResultsDto } from "../../../api/models";
import { fmtPct } from "../../../lib/formatting";
import { WithResults, Scoreboard } from "../../results";
import { MAP_TYPES, type MapType } from "../types";

export interface MapSidePanelProps {
  /** results of the geo area shown on the map (for its name, coverage and parent) */
  results: ResultsDto | undefined;
  /** name of the geo area when the results have not loaded (from the global filter) */
  fallbackName: string;
  type: MapType;
  types: typeof MAP_TYPES;
  onTypeChange: (type: MapType) => void;
  /** the country level shows the "all municipalities" switch */
  atCountry: boolean;
  allMunicipalities: boolean;
  onAllMunicipalitiesChange: (on: boolean) => void;
  basemap: boolean;
  onBasemapChange: (on: boolean) => void;
  /** the office has no national result: the scoreboard is hidden */
  noBrResult: boolean;
  onUp: (parent: { level: string; id: string; name: string }) => void;
  onExplore: () => void;
  parent: { level: string; id: string; name: string } | undefined;
}

/** Side panel of the maps screen: the current area, the kinds of map and the switches. */
export function MapSidePanel(p: MapSidePanelProps) {
  const { results, parent } = p;
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Stack gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Recorte
          </Text>
          <Text fw={800} size="lg" lineClamp={1}>
            {results?.geo_area.name ?? p.fallbackName}
          </Text>
          {results && !results.no_data && (
            <Text size="xs" c="dimmed">
              {fmtPct(results.totals.pct_sections)} das seções apuradas
            </Text>
          )}
        </Stack>
        <Group gap={4}>
          {parent && (
            <Tooltip label={`Subir para ${parent.name}`}>
              <ActionIcon variant="default" onClick={() => p.onUp(parent)} aria-label="Subir um nível">
                <IconArrowUp size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Explorar este recorte">
            <ActionIcon variant="default" onClick={p.onExplore} aria-label="Explorar">
              <IconCompass size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        Tipo de mapa
      </Text>
      <Stack gap={4}>
        {p.types.map((t) => (
          <UnstyledButton key={t.valor} onClick={() => p.onTypeChange(t.valor)}>
            <Card
              p="xs"
              withBorder
              style={{
                borderColor: p.type === t.valor ? "var(--mantine-color-eleicao-4)" : undefined,
                background: p.type === t.valor ? "var(--mantine-color-default-hover)" : undefined,
              }}
            >
              <Text size="sm" fw={700}>
                {t.rotulo}
              </Text>
              <Text size="xs" c="dimmed">
                {t.descricao}
              </Text>
            </Card>
          </UnstyledButton>
        ))}
      </Stack>
      {p.atCountry && (
        <Switch
          label="Todos os municípios do Brasil"
          checked={p.allMunicipalities}
          onChange={(e) => p.onAllMunicipalitiesChange(e.currentTarget.checked)}
        />
      )}
      <Switch
        label="Mapa de fundo"
        checked={p.basemap}
        onChange={(e) => p.onBasemapChange(e.currentTarget.checked)}
      />
      {!p.noBrResult && (
        <Card p="sm" withBorder>
          <WithResults linhasSkeleton={3}>
            {(r) => <Scoreboard res={r} opcoes={{ topN: 5, mostrarFotos: false }} />}
          </WithResults>
        </Card>
      )}
    </Stack>
  );
}
