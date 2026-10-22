import { ActionIcon, Button, Group, MultiSelect, Stack, Text } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useCandidates, CandidatePicker, GeoAreaPicker, readGeoArea, geoAreaValue } from "../../results";

interface CandidatesFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
  round: number;
  office: number;
  uf: string | null;
}

/** Up to four candidates, picked from the list of the round and office. */
export function CandidatesField({ value, onChange, round, office, uf }: CandidatesFieldProps) {
  const query = useCandidates(round, office, office === 1 ? null : uf);
  return (
    <MultiSelect
      label="Candidatos (até 4)"
      data={(query.data ?? []).map((candidate) => ({
        value: candidate.tse_candidate_id,
        label: `${candidate.ballot_name} (${candidate.ballot_number}) · ${candidate.party_abbreviation}`,
      }))}
      value={value}
      onChange={onChange}
      maxValues={4}
      searchable
      clearable
    />
  );
}

interface GeoAreaListFieldProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}

/** Up to four geo areas, each with its own picker, plus add and remove buttons. */
export function GeoAreaListField({ label, value, onChange }: GeoAreaListFieldProps) {
  const replaceAt = (index: number, next: string | null) =>
    onChange(
      next ? value.map((item, i) => (i === index ? next : item)) : value.filter((_, i) => i !== index),
    );
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      {value.map((area, index) => (
        <Group key={index} gap={6} wrap="nowrap">
          <GeoAreaPicker value={area} onChange={(next) => replaceAt(index, next)} style={{ flex: 1 }} />
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label="Remover recorte"
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      {value.length < 4 && (
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() => onChange([...value, "uf:sp"])}
          w="fit-content"
        >
          Adicionar recorte
        </Button>
      )}
    </Stack>
  );
}

interface GeoPlaceFieldProps {
  label: string;
  level: "polling_place" | "section";
  value: unknown;
  onChange: (id: string | undefined) => void;
}

/** A single polling place or section, picked from the geo area picker. */
export function GeoPlaceField({ label, level, value, onChange }: GeoPlaceFieldProps) {
  const selected = typeof value === "string" && value ? geoAreaValue(level, value) : null;
  return (
    <GeoAreaPicker
      label={label}
      tipos={[level]}
      incluirBrasil={false}
      incluirUfs={false}
      value={selected}
      onChange={(next) => onChange(readGeoArea(next)?.id ?? undefined)}
    />
  );
}

/** Candidate picker wired to the round and office of the widget (or of the filter). */
export function CandidateField({
  label,
  value,
  onChange,
  round,
  office,
  uf,
}: {
  label: string;
  value: unknown;
  onChange: (id: string | undefined) => void;
  round: number;
  office: number;
  uf: string | null;
}) {
  return (
    <CandidatePicker
      label={label}
      value={(value as string) ?? null}
      onChange={(next) => onChange(next ?? undefined)}
      turno={round}
      cargo={office}
      uf={uf}
    />
  );
}
