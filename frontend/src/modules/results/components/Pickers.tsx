import { Select, type SelectProps } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useSearch } from "../../shell";
import { useCandidates } from "../hooks";
import type { Level, SearchType } from "../../../api/models";
import { UFS, defaultGeoAreaName, asLevel, segmentOfLevel, levelOfSegment } from "../../../lib/geo-areas";

/** Office code of the president: the only one with a single national result. */
const PRESIDENT_OFFICE = 1;

/** Value "level:id" of a geo area option. */
export const geoAreaValue = (level: Level, id: string) => `${segmentOfLevel(level)}:${id}`;

export function readGeoArea(value: string | null | undefined): { nivel: Level; id: string } | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator < 0) return null;
  const level = levelOfSegment(value.slice(0, separator));
  return level ? { nivel: level, id: value.slice(separator + 1) } : null;
}

interface GeoAreaPickerProps extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: string | null;
  onChange: (value: string | null, name?: string) => void;
  types?: SearchType[];
  includeBrazil?: boolean;
  includeStates?: boolean;
}

/** Geo area picker with search (the /busca endpoint). */
export function GeoAreaPicker({
  value,
  onChange,
  types,
  includeBrazil = true,
  includeStates = true,
  ...rest
}: GeoAreaPickerProps) {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const query = useSearch(debounced);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const data = useMemo(() => {
    const base: { value: string; label: string }[] = [];
    const allows = (type: SearchType) => !types || types.includes(type);
    if (includeBrazil && !types) base.push({ value: geoAreaValue("country", "br"), label: "Brasil" });
    if (includeStates && allows("state"))
      for (const state of UFS)
        base.push({
          value: geoAreaValue("state", state.uf),
          label: `${state.nome} (${state.uf.toUpperCase()})`,
        });
    const remote = (query.data?.items ?? [])
      .filter((item) => item.type !== "candidate" && allows(item.type as SearchType))
      .map((item) => ({
        value: geoAreaValue(asLevel(item.level ?? item.type), item.id),
        label: `${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`,
      }));
    const all = [...remote, ...base];
    if (value && !all.some((option) => option.value === value)) {
      const area = readGeoArea(value);
      all.unshift({
        value,
        label: labels[value] ?? (area ? defaultGeoAreaName(area.nivel, area.id) : value),
      });
    }
    const seen = new Set<string>();
    return all.filter((option) => (seen.has(option.value) ? false : (seen.add(option.value), true)));
  }, [query.data, types, includeBrazil, includeStates, value, labels]);
  return (
    <Select
      searchable
      clearable
      placeholder="Digite para buscar (município, zona, escola…)"
      nothingFoundMessage={debounced.length < 2 ? "Digite ao menos 2 letras" : "Nada encontrado"}
      {...rest}
      data={data}
      value={value}
      searchValue={search}
      onSearchChange={setSearch}
      filter={({ options }) => options}
      onChange={(next) => {
        const label = data.find((option) => option.value === next)?.label;
        if (next && label) setLabels((current) => ({ ...current, [next]: label }));
        onChange(next, label?.split(" — ")[0]);
      }}
    />
  );
}

interface CandidatePickerProps extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: string | null;
  onChange: (value: string | null) => void;
  round: number;
  office: number;
  state?: string | null;
}

/** Candidate of the round and office (and state, for state offices). */
export function CandidatePicker({ value, onChange, round, office, state, ...rest }: CandidatePickerProps) {
  const query = useCandidates(round, office, office === PRESIDENT_OFFICE ? null : (state ?? null));
  const data = useMemo(() => {
    const options = (query.data ?? []).map((candidate) => ({
      value: candidate.tse_candidate_id,
      label: `${candidate.ballot_name} (${candidate.ballot_number}) · ${candidate.party_abbreviation}${candidate.state_code ? ` · ${candidate.state_code.toUpperCase()}` : ""}`,
    }));
    if (value && !options.some((option) => option.value === value))
      options.unshift({ value, label: `Candidato ${value}` });
    return options;
  }, [query.data, value]);
  return (
    <Select
      searchable
      clearable
      placeholder={query.isLoading ? "Carregando…" : "Escolha um candidato"}
      nothingFoundMessage="Nenhum candidato"
      {...rest}
      data={data}
      value={value}
      onChange={onChange}
    />
  );
}
