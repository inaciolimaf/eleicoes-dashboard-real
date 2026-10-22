import { Alert, Button, Divider, Drawer, Group, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import type { Level } from "../../../api/models";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { stateOfId } from "../../../lib/geo-areas";
import { COMMON_FIELDS, REGISTRY } from "../widgets/registry";
import type { FieldConfig } from "../widgets/types";
import type { WidgetCfg, WidgetFilters } from "../schema";
import { FieldInput } from "./FieldInput";
import { FilterSource } from "./FilterSource";

interface ConfigDrawerProps {
  /** The widget being configured; `null` closes the drawer. */
  widget: WidgetCfg | null;
  onClose: () => void;
  onSave: (widget: WidgetCfg) => void;
}

/** Configuration drawer of a widget: data source (inherit or fix), appearance and behavior. */
export function ConfigDrawer({ widget, onClose, onSave }: ConfigDrawerProps) {
  const [draft, setDraft] = useState<WidgetCfg | null>(widget);
  useEffect(() => setDraft(widget), [widget]);
  const filter = useEffectiveFilter();
  if (!draft) return <Drawer opened={false} onClose={onClose} />;

  const definition = REGISTRY[draft.tipo];
  const config = { ...definition.defaults, ...draft.config };
  const filters: WidgetFilters = draft.filtros ?? {};
  const fixed = !draft.herda;
  const round = (fixed && filters.turno) || filter.turno;
  const office = (fixed && filters.cargo) || filter.cargo;
  const uf =
    fixed && filters.nivel && filters.recorte
      ? stateOfId(filters.nivel as Level, filters.recorte)
      : stateOfId(filter.nivel, filter.id);

  const updateDraft = (update: (widget: WidgetCfg) => WidgetCfg) =>
    setDraft((current) => (current ? update(current) : current));
  const setField = (key: string, value: unknown) =>
    updateDraft((current) => {
      const next = { ...current.config };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...current, config: next };
    });

  return (
    <Drawer
      opened={!!widget}
      onClose={onClose}
      position="right"
      size="md"
      title={
        <Group gap={8}>
          <definition.icon size={18} />
          <Text fw={700}>Configurar · {definition.name}</Text>
        </Group>
      }
    >
      <Stack gap="md">
        <FilterSource
          widget={draft}
          inherited={{ turno: filter.turno, cargo: filter.cargo, nivel: filter.nivel, id: filter.id }}
          onChange={updateDraft}
        />
        <Divider label="Aparência e comportamento" labelPosition="left" />
        <FieldList
          fields={[
            ...COMMON_FIELDS,
            ...definition.fields.filter((field) => !field.when || field.when(config)),
          ]}
          config={config}
          onSetField={setField}
          round={round}
          office={office}
          uf={uf}
        />
        {definition.fields.length === 0 && (
          <Alert variant="light" color="gray">
            Este widget não tem opções próprias além do título e da fonte de dados.
          </Alert>
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Aplicar
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
}

function FieldList({
  fields,
  config,
  onSetField,
  round,
  office,
  uf,
}: {
  fields: FieldConfig[];
  config: Record<string, unknown>;
  onSetField: (key: string, value: unknown) => void;
  round: number;
  office: number;
  uf: string | null;
}) {
  return (
    <>
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={field.key === "clique" ? (config[field.key] ?? "filtrar") : config[field.key]}
          onChange={(value) => onSetField(field.key, value)}
          round={round}
          office={office}
          uf={uf}
        />
      ))}
    </>
  );
}
