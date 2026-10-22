import {
  Badge,
  Box,
  Button,
  Card,
  Drawer,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { stripAccents } from "../../../lib/formatting";
import { CATALOG } from "../widgets/registry";
import type { DefWidget } from "../widgets/types";
import type { WidgetType } from "../schema";
import { WidgetFrame } from "../grid/WidgetFrame";

interface WidgetDrawerProps {
  open: boolean;
  onClose: () => void;
  onAdd: (type: WidgetType) => void;
}

/** "Add widget" drawer: searchable catalog with a live preview of the selected widget. */
export function WidgetDrawer({ open, onClose, onAdd }: WidgetDrawerProps) {
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<WidgetType>("placar");
  const list = useMemo(() => {
    const query = stripAccents(search.trim());
    return CATALOG.filter(
      (definition) => !query || stripAccents(`${definition.name} ${definition.description}`).includes(query),
    );
  }, [search]);
  const selected = CATALOG.find((definition) => definition.type === selectedType) ?? CATALOG[0];
  return (
    <Drawer
      opened={open}
      onClose={onClose}
      position="right"
      size="xl"
      title={<Text fw={700}>Adicionar widget</Text>}
    >
      <Stack gap="sm">
        <TextInput
          placeholder="Buscar no catálogo…"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          data-autofocus
        />
        <WidgetPreview definition={selected} open={open} onAdd={onAdd} />
        <ScrollArea.Autosize mah="calc(100vh - 470px)" className="scroll-fino">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            {list.map((definition, index) => (
              <UnstyledButton
                key={definition.type}
                onClick={() => setSelectedType(definition.type)}
                onDoubleClick={() => onAdd(definition.type)}
              >
                <CatalogItem
                  definition={definition}
                  index={index}
                  selected={selectedType === definition.type}
                />
              </UnstyledButton>
            ))}
          </SimpleGrid>
        </ScrollArea.Autosize>
      </Stack>
    </Drawer>
  );
}

/** Live preview of the selected widget type with its default configuration, and the "Add" button. */
function WidgetPreview({
  definition,
  open,
  onAdd,
}: {
  definition: DefWidget;
  open: boolean;
  onAdd: (type: WidgetType) => void;
}) {
  return (
    <Card withBorder p="xs" radius="lg">
      <Group justify="space-between" mb={6}>
        <Group gap={6}>
          <ThemeIcon variant="light" size="sm">
            <definition.icon size={14} />
          </ThemeIcon>
          <Text fw={700} size="sm">
            Pré-visualização: {definition.name}
          </Text>
        </Group>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => onAdd(definition.type)}>
          Adicionar
        </Button>
      </Group>
      <Box h={280} style={{ pointerEvents: "auto" }}>
        {open && (
          <WidgetFrame
            key={definition.type}
            widget={{
              id: `preview-${definition.type}`,
              tipo: definition.type,
              pos: { x: 0, y: 0, ...definition.size },
              herda: true,
              config: { ...definition.defaults },
            }}
            editing={false}
          />
        )}
      </Box>
    </Card>
  );
}

/** One entry of the catalog list: icon, name, position number and description. */
function CatalogItem({
  definition,
  index,
  selected,
}: {
  definition: DefWidget;
  index: number;
  selected: boolean;
}) {
  return (
    <Card
      withBorder
      p="xs"
      radius="md"
      style={{
        borderColor: selected ? "var(--mantine-color-election-4)" : undefined,
        height: "100%",
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon variant={selected ? "filled" : "light"} size="lg" radius="md">
          <definition.icon size={18} />
        </ThemeIcon>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Group gap={4}>
            <Text fw={700} size="sm">
              {definition.name}
            </Text>
            <Badge size="xs" variant="outline" color="gray">
              {index + 1}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {definition.description}
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}
