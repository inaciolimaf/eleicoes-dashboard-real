import { Select, type SelectProps } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useSearch } from "../../shell";
import { useCandidates } from "../hooks";
import type { Level, SearchType } from "../../../api/models";
import { UFS, defaultGeoAreaName } from "../../../lib/geo-areas";
import { asLevel, segmentOfLevel, levelOfSegment } from "../../../lib/geo-areas";

/** Valor "nivel:id" */
export const geoAreaValue = (nivel: Level, id: string) => `${segmentOfLevel(nivel)}:${id}`;
export function readGeoArea(v: string | null | undefined): { nivel: Level; id: string } | null {
  if (!v) return null;
  const i = v.indexOf(":");
  if (i < 0) return null;
  const nivel = levelOfSegment(v.slice(0, i));
  return nivel ? { nivel, id: v.slice(i + 1) } : null;
}

interface GeoAreaPickerProps extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: string | null;
  onChange: (v: string | null, nome?: string) => void;
  tipos?: SearchType[];
  incluirBrasil?: boolean;
  incluirUfs?: boolean;
}

/** Seleção de recorte com busca (/busca). */
export function GeoAreaPicker({
  value,
  onChange,
  tipos,
  incluirBrasil = true,
  incluirUfs = true,
  ...rest
}: GeoAreaPickerProps) {
  const [busca, setBusca] = useState("");
  const [deb] = useDebouncedValue(busca, 250);
  const q = useSearch(deb);
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  const data = useMemo(() => {
    const base: { value: string; label: string }[] = [];
    const permite = (t: SearchType) => !tipos || tipos.includes(t);
    if (incluirBrasil && !tipos) base.push({ value: geoAreaValue("country", "br"), label: "Brasil" });
    if (incluirUfs && permite("state"))
      for (const u of UFS)
        base.push({ value: geoAreaValue("state", u.uf), label: `${u.nome} (${u.uf.toUpperCase()})` });
    const remotos = (q.data?.items ?? [])
      .filter((i) => i.type !== "candidate" && permite(i.type as SearchType))
      .map((i) => ({
        value: geoAreaValue(asLevel(i.level ?? i.type), i.id),
        label: `${i.title}${i.subtitle ? ` — ${i.subtitle}` : ""}`,
      }));
    const todos = [...remotos, ...base];
    if (value && !todos.some((d) => d.value === value)) {
      const r = readGeoArea(value);
      todos.unshift({ value, label: rotulos[value] ?? (r ? defaultGeoAreaName(r.nivel, r.id) : value) });
    }
    const vistos = new Set<string>();
    return todos.filter((d) => (vistos.has(d.value) ? false : (vistos.add(d.value), true)));
  }, [q.data, tipos, incluirBrasil, incluirUfs, value, rotulos]);
  return (
    <Select
      searchable
      clearable
      placeholder="Digite para buscar (município, zona, escola…)"
      nothingFoundMessage={deb.length < 2 ? "Digite ao menos 2 letras" : "Nada encontrado"}
      {...rest}
      data={data}
      value={value}
      searchValue={busca}
      onSearchChange={setBusca}
      filter={({ options }) => options}
      onChange={(v) => {
        const label = data.find((d) => d.value === v)?.label;
        if (v && label) setRotulos((r) => ({ ...r, [v]: label }));
        onChange(v, label?.split(" — ")[0]);
      }}
    />
  );
}

interface CandidatePickerProps extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: string | null;
  onChange: (v: string | null) => void;
  turno: number;
  cargo: number;
  uf?: string | null;
}

export function CandidatePicker({ value, onChange, turno, cargo, uf, ...rest }: CandidatePickerProps) {
  const q = useCandidates(turno, cargo, cargo === 1 ? null : (uf ?? null));
  const data = useMemo(() => {
    const d = (q.data ?? []).map((c) => ({
      value: c.tse_candidate_id,
      label: `${c.ballot_name} (${c.ballot_number}) · ${c.party_abbreviation}${c.state_code ? ` · ${c.state_code.toUpperCase()}` : ""}`,
    }));
    if (value && !d.some((x) => x.value === value)) d.unshift({ value, label: `Candidato ${value}` });
    return d;
  }, [q.data, value]);
  return (
    <Select
      searchable
      clearable
      placeholder={q.isLoading ? "Carregando…" : "Escolha um candidato"}
      nothingFoundMessage="Nenhum candidato"
      {...rest}
      data={data}
      value={value}
      onChange={onChange}
    />
  );
}
