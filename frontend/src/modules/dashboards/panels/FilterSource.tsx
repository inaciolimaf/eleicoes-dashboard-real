import { Divider, Group, SegmentedControl, Select, Stack } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import type { Level } from "../../../api/models";
import { GeoAreaPicker, geoAreaValue, readGeoArea } from "../../results";
import { OFFICE_OPTIONS } from "../../../lib/offices";
import { dayjs } from "../../../lib/time";
import type { WidgetCfg, WidgetFilters } from "../schema";

/** The filter the widget gets when it does not fix its own: the one of the dashboard. */
export interface InheritedFilter {
  turno: number;
  cargo: number;
  nivel: Level;
  id: string;
}

interface FilterSourceProps {
  widget: WidgetCfg;
  inherited: InheritedFilter;
  onChange: (update: (widget: WidgetCfg) => WidgetCfg) => void;
}

/** "Fonte dos dados": inherit the dashboard's filter, or fix one for this widget. */
export function FilterSource({ widget, inherited, onChange }: FilterSourceProps) {
  const filters: WidgetFilters = widget.filtros ?? {};
  const setFilters = (patch: Partial<WidgetFilters>) =>
    onChange((current) => ({ ...current, filtros: { ...(current.filtros ?? {}), ...patch } }));
  const setInheritance = (value: string) =>
    onChange((current) => ({
      ...current,
      herda: value === "herda",
      filtros:
        value === "herda"
          ? current.filtros
          : {
              cargo: inherited.cargo,
              turno: inherited.turno,
              nivel: inherited.nivel,
              recorte: inherited.id,
              tempo: "agora",
              ...(current.filtros ?? {}),
            },
    }));
  return (
    <>
      <Divider label="Fonte dos dados" labelPosition="left" />
      <SegmentedControl
        fullWidth
        value={widget.herda ? "herda" : "fixo"}
        onChange={setInheritance}
        data={[
          {
            value: "herda",
            label: (
              <Group gap={4} justify="center">
                <IconLockOpen size={14} />
                Herdar filtro do painel
              </Group>
            ),
          },
          {
            value: "fixo",
            label: (
              <Group gap={4} justify="center">
                <IconLock size={14} />
                Fixar
              </Group>
            ),
          },
        ]}
      />
      {!widget.herda && <FixedFilterFields filters={filters} inherited={inherited} setFilters={setFilters} />}
    </>
  );
}

function FixedFilterFields({
  filters,
  inherited,
  setFilters,
}: {
  filters: WidgetFilters;
  inherited: InheritedFilter;
  setFilters: (patch: Partial<WidgetFilters>) => void;
}) {
  const timeFixed = !!filters.tempo && filters.tempo !== "agora";
  const selectedArea = filters.nivel && filters.recorte ? geoAreaValue(filters.nivel, filters.recorte) : null;
  return (
    <Stack gap="sm">
      <Group grow>
        <Select
          label="Turno"
          data={[
            { value: "1", label: "1º turno" },
            { value: "2", label: "2º turno" },
          ]}
          value={String(filters.turno ?? inherited.turno)}
          onChange={(v) => setFilters({ turno: Number(v ?? 1) })}
          allowDeselect={false}
        />
        <Select
          label="Cargo"
          data={OFFICE_OPTIONS.map((o) => ({ value: o.valor, label: o.rotulo }))}
          value={String(filters.cargo === 8 ? 7 : (filters.cargo ?? inherited.cargo))}
          onChange={(v) => setFilters({ cargo: Number(v ?? 1) })}
          allowDeselect={false}
        />
      </Group>
      <GeoAreaPicker
        label="Recorte"
        value={selectedArea}
        onChange={(v) => {
          const area = readGeoArea(v);
          setFilters(
            area ? { nivel: area.nivel, recorte: area.id } : { nivel: undefined, recorte: undefined },
          );
        }}
      />
      <SegmentedControl
        value={timeFixed ? "fixo" : "agora"}
        onChange={(v) =>
          setFilters({ tempo: v === "agora" ? "agora" : dayjs().startOf("minute").toISOString() })
        }
        data={[
          { value: "agora", label: "Ao vivo" },
          { value: "fixo", label: "Congelar no tempo" },
        ]}
      />
      {timeFixed && (
        <DateTimePicker
          label="Instante (horário de Brasília)"
          value={filters.tempo ? new Date(filters.tempo) : null}
          onChange={(d) => setFilters({ tempo: d ? dayjs(d).toISOString() : "agora" })}
          valueFormat="DD/MM/YYYY HH:mm"
          withSeconds={false}
        />
      )}
    </Stack>
  );
}
