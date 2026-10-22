import { ActionIcon, Badge, Button, Group, Menu, Stack, Title, Tooltip } from "@mantine/core";
import { IconArrowUp, IconDownload, IconStar, IconStarFilled } from "@tabler/icons-react";
import type { GeoAreaRefDto, Level } from "../../../api/models";
import { exportData } from "../../../lib/export";
import { asLevel, LEVEL_LABELS } from "../../../lib/geo-areas";
import { OFFICE_NAME } from "../../../lib/offices";
import type { useEffectiveFilter } from "../../../lib/effective-filter";

type EffectiveFilter = ReturnType<typeof useEffectiveFilter>;

/** Menu that downloads the result of the area, as CSV or JSON. */
function ResultExportMenu({ filter, level, id }: { filter: EffectiveFilter; level: Level; id: string }) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="xs" variant="default" leftSection={<IconDownload size={14} />}>
          Resultado
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => exportData("resultados", "csv", { ...filter, nivel: level, id })}>
          CSV
        </Menu.Item>
        <Menu.Item onClick={() => exportData("resultados", "json", { ...filter, nivel: level, id })}>
          JSON
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

interface ExploreHeaderProps {
  filter: EffectiveFilter;
  level: Level;
  id: string;
  name: string;
  parent: GeoAreaRefDto | undefined;
  favorite: boolean;
  onToggleFavorite: () => void;
  onOpenArea: (level: Level, id: string, name?: string) => void;
  showResultExport: boolean;
}

/** Title of the area with its level and office, the favorite toggle, the parent button and the export. */
export function ExploreHeader({
  filter,
  level,
  id,
  name,
  parent,
  favorite,
  onToggleFavorite,
  onOpenArea,
  showResultExport,
}: ExploreHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap">
      <Stack gap={2}>
        <Group gap={6}>
          <Badge variant="light">{LEVEL_LABELS[level]}</Badge>
          <Badge variant="outline" color="gray">
            {OFFICE_NAME[filter.cargo] ?? filter.cargo}
          </Badge>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Title order={2} lineClamp={1}>
            {name}
          </Title>
          <Tooltip label={favorite ? "Remover dos favoritos" : "Favoritar"}>
            <ActionIcon variant="subtle" color="yellow" onClick={onToggleFavorite} aria-label="Favoritar">
              {favorite ? <IconStarFilled size={18} /> : <IconStar size={18} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
      <Group gap="xs">
        {parent && (
          <Button
            size="xs"
            variant="default"
            leftSection={<IconArrowUp size={14} />}
            onClick={() => onOpenArea(asLevel(parent.level), parent.id, parent.name)}
          >
            {parent.name}
          </Button>
        )}
        {showResultExport && <ResultExportMenu filter={filter} level={level} id={id} />}
      </Group>
    </Group>
  );
}
