import {
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileImport, IconLayoutDashboard, IconSquarePlus } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GeoAreaPicker, readGeoArea } from "../../results";
import { useFilter } from "../../../lib/filter-store";
import { useDashboards } from "../hooks";
import { readDashboardFile } from "../file";
import { SCHEMA_VERSION } from "../schema";
import { TEMPLATES, type Template } from "../templates";

/** The blank template: the current filter and no widgets. */
const BLANK_TEMPLATE: Template = {
  id: "branco",
  name: "Painel em branco",
  description: "Comece do zero e adicione widgets do catálogo.",
  create: () => ({
    schemaVersion: SCHEMA_VERSION,
    filtroGlobal: { ...currentFilter(), tempo: "agora" },
    widgets: [],
  }),
};

function currentFilter() {
  const filter = useFilter.getState();
  return {
    ambiente: "oficial",
    ciclo: filter.ciclo ?? "ele2026",
    turno: filter.turno,
    cargo: filter.cargo,
    nivel: filter.nivel,
    recorte: filter.id,
  };
}

const NEEDS_LABEL: Record<NonNullable<Template["needs"]>, string> = {
  state: "UF",
  municipality: "Município",
  polling_place: "Local de votação",
};
const NEEDS_BADGE: Record<NonNullable<Template["needs"]>, string> = {
  state: "a UF",
  municipality: "o município",
  polling_place: "o local",
};

interface NewDashboardModalProps {
  open: boolean;
  onClose: () => void;
}

/** "Novo painel": pick a template (or a blank dashboard), name it, pick its area, or import a file. */
export function NewDashboardModal({ open, onClose }: NewDashboardModalProps) {
  const { create } = useDashboards();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [areaLabel, setAreaLabel] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const close = () => {
    setSelected(null);
    setName("");
    setAreaId(null);
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!selected) return;
    if (selected.needs && !areaId) {
      setError("Escolha o recorte para este template.");
      return;
    }
    setCreating(true);
    try {
      const area = readGeoArea(areaId);
      const config = selected.create({
        areaId: area?.id,
        name: areaLabel,
        round: useFilter.getState().turno,
      });
      const created = await create(name.trim() || config.nome || selected.name, config);
      notifications.show({ color: "teal", title: "Painel criado", message: created.name });
      close();
      navigate(`/paineis/${created.id}`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const importFile = async (file: File | null) => {
    if (!file) return;
    try {
      const imported = readDashboardFile(await file.text());
      const created = await create(imported.name, imported.config, false);
      notifications.show({ color: "teal", title: "Painel importado", message: created.name });
      close();
      navigate(`/paineis/${created.id}`);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  return (
    <Modal opened={open} onClose={close} size="xl" title={<Text fw={700}>Novo painel</Text>}>
      <Stack>
        <Text size="sm" c="dimmed">
          Escolha um template para começar. Tudo pode ser personalizado depois.
        </Text>
        <TemplateGrid
          selectedId={selected?.id ?? null}
          onSelect={(template) => {
            setSelected(template);
            setError(null);
            setAreaId(null);
          }}
        />
        {selected && (
          <TemplateOptions
            template={selected}
            name={name}
            onNameChange={setName}
            areaId={areaId}
            onArea={(value, label) => {
              setAreaId(value);
              setAreaLabel(label);
            }}
          />
        )}
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <ModalFooter
          onImport={importFile}
          onCancel={close}
          onCreate={confirm}
          canCreate={!!selected}
          creating={creating}
        />
      </Stack>
    </Modal>
  );
}

function ModalFooter({
  onImport,
  onCancel,
  onCreate,
  canCreate,
  creating,
}: {
  onImport: (file: File | null) => void;
  onCancel: () => void;
  onCreate: () => void;
  canCreate: boolean;
  creating: boolean;
}) {
  return (
    <Group justify="space-between">
      <FileButton onChange={onImport} accept="application/json,.json">
        {(props) => (
          <Button variant="subtle" leftSection={<IconFileImport size={16} />} {...props}>
            Importar JSON
          </Button>
        )}
      </FileButton>
      <Group>
        <Button variant="default" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={onCreate} disabled={!canCreate} loading={creating}>
          Criar painel
        </Button>
      </Group>
    </Group>
  );
}

/** The selectable templates, the blank one last. */
function TemplateGrid({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (template: Template) => void;
}) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
      {[...TEMPLATES, BLANK_TEMPLATE].map((template) => (
        <UnstyledButton key={template.id} onClick={() => onSelect(template)}>
          <TemplateCard template={template} selected={selectedId === template.id} />
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
}

interface TemplateOptionsProps {
  template: Template;
  name: string;
  onNameChange: (name: string) => void;
  areaId: string | null;
  onArea: (areaId: string | null, label: string | undefined) => void;
}

/** Name of the dashboard and, for templates that need one, the area the user picks. */
function TemplateOptions({ template, name, onNameChange, areaId, onArea }: TemplateOptionsProps) {
  return (
    <Card withBorder p="sm">
      <Stack gap="sm">
        <TextInput
          label="Nome do painel"
          placeholder={template.name}
          value={name}
          onChange={(event) => onNameChange(event.currentTarget.value)}
        />
        {template.needs && (
          <GeoAreaPicker
            label={NEEDS_LABEL[template.needs]}
            types={[template.needs]}
            includeBrazil={false}
            includeStates={template.needs === "state"}
            value={areaId}
            onChange={onArea}
          />
        )}
      </Stack>
    </Card>
  );
}

function TemplateCard({ template, selected }: { template: Template; selected: boolean }) {
  return (
    <Card
      withBorder
      p="sm"
      h="100%"
      style={{ borderColor: selected ? "var(--mantine-color-election-4)" : undefined }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size="lg" variant={selected ? "filled" : "light"} radius="md">
          {template.id === "branco" ? <IconSquarePlus size={18} /> : <IconLayoutDashboard size={18} />}
        </ThemeIcon>
        <Stack gap={2}>
          <Text fw={700} size="sm">
            {template.name}
          </Text>
          <Text size="xs" c="dimmed">
            {template.description}
          </Text>
          {template.needs && (
            <Badge size="xs" variant="light" mt={4}>
              escolha {NEEDS_BADGE[template.needs]}
            </Badge>
          )}
        </Stack>
      </Group>
    </Card>
  );
}
