import { ColorInput, NumberInput, Select, Switch, Textarea, TextInput, MultiSelect } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { GeoAreaPicker } from "../../results";
import { dayjs } from "../../../lib/time";
import { WIDGET_COLOR_SWATCHES } from "../../../lib/palettes/dashboards";
import type { FieldConfig, FieldType } from "../widgets/types";
import { CandidateField, CandidatesField, GeoAreaListField, GeoPlaceField } from "./field-controls";

interface FieldInputProps {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  round: number;
  office: number;
  uf: string | null;
}

/** Types that open a picker (candidates, areas, polling places, sections, dates). */
const PICKER_TYPES: FieldType[] = [
  "candidate",
  "candidates",
  "geoArea",
  "geoAreas",
  "pollingPlace",
  "section",
  "datetime",
];

/** Renders the input of one configuration field, according to its type. */
export function FieldInput(props: FieldInputProps) {
  return PICKER_TYPES.includes(props.field.type) ? (
    <PickerFieldInput {...props} />
  ) : (
    <BasicFieldInput {...props} />
  );
}

/** Text, number, switch, select, color: the inputs that need no lookup. */
function BasicFieldInput({ field, value, onChange }: FieldInputProps) {
  const label = field.label;
  switch (field.type) {
    case "text":
      return (
        <TextInput
          label={label}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
    case "textarea":
      return (
        <Textarea
          label={label}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.currentTarget.value)}
          autosize
          minRows={5}
          maxRows={14}
        />
      );
    case "number":
      return (
        <NumberInput
          label={label}
          value={typeof value === "number" ? value : ""}
          onChange={(v) => onChange(typeof v === "number" ? v : undefined)}
          min={field.min}
          max={field.max}
        />
      );
    case "switch":
      return <Switch label={label} checked={!!value} onChange={(e) => onChange(e.currentTarget.checked)} />;
    case "select":
      return (
        <Select
          label={label}
          data={field.options ?? []}
          value={(value as string) ?? null}
          onChange={(v) => onChange(v ?? undefined)}
          allowDeselect={false}
        />
      );
    case "multiselect":
      return (
        <MultiSelect
          label={label}
          data={field.options ?? []}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(v) => onChange(v)}
          clearable
          searchable
        />
      );
    case "color":
      return (
        <ColorInput
          label={label}
          value={(value as string) ?? ""}
          onChange={(v) => onChange(v || undefined)}
          swatches={WIDGET_COLOR_SWATCHES}
        />
      );
    default:
      return null;
  }
}

/** Candidate, area, polling place, section and date inputs. */
function PickerFieldInput({ field, value, onChange, round, office, uf }: FieldInputProps) {
  const label = field.label;
  switch (field.type) {
    case "candidate":
      return (
        <CandidateField
          label={label}
          value={value}
          onChange={onChange}
          round={round}
          office={office}
          uf={uf}
        />
      );
    case "candidates":
      return (
        <CandidatesField
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          round={round}
          office={office}
          uf={uf}
        />
      );
    case "geoArea":
      return (
        <GeoAreaPicker
          label={label}
          value={(value as string) ?? null}
          onChange={(v) => onChange(v ?? undefined)}
        />
      );
    case "pollingPlace":
      return <GeoPlaceField label={label} level="polling_place" value={value} onChange={onChange} />;
    case "section":
      return <GeoPlaceField label={label} level="section" value={value} onChange={onChange} />;
    case "geoAreas":
      return (
        <GeoAreaListField
          label={label}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
        />
      );
    case "datetime":
      return (
        <DateTimePicker
          label={label}
          value={typeof value === "string" && value ? new Date(value) : null}
          onChange={(d) => onChange(d ? dayjs(d).toISOString() : undefined)}
          valueFormat="DD/MM/YYYY HH:mm"
          clearable
        />
      );
    default:
      return null;
  }
}
