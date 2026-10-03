import { Select, type SelectProps } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useBusca, useCandidatos } from "../../api/hooks";
import type { Nivel, TipoBusca } from "../../api/types";
import { UFS, nomeRecortePadrao } from "../../lib/recortes";

/** Valor "nivel:id" */
export const valorRecorte = (nivel: Nivel, id: string) => `${nivel}:${id}`;
export function lerRecorte(v: string | null | undefined): { nivel: Nivel; id: string } | null {
  if (!v) return null;
  const i = v.indexOf(":");
  if (i < 0) return null;
  return { nivel: v.slice(0, i) as Nivel, id: v.slice(i + 1) };
}

interface RecortePickerProps extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: string | null;
  onChange: (v: string | null, nome?: string) => void;
  tipos?: TipoBusca[];
  incluirBrasil?: boolean;
  incluirUfs?: boolean;
}

/** Seleção de recorte com busca (/busca). */
export function RecortePicker({ value, onChange, tipos, incluirBrasil = true, incluirUfs = true, ...rest }: RecortePickerProps) {
  const [busca, setBusca] = useState("");
  const [deb] = useDebouncedValue(busca, 250);
  const q = useBusca(deb);
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  const data = useMemo(() => {
    const base: { value: string; label: string }[] = [];
    const permite = (t: TipoBusca) => !tipos || tipos.includes(t);
    if (incluirBrasil && !tipos) base.push({ value: "br:br", label: "Brasil" });
    if (incluirUfs && permite("uf")) for (const u of UFS) base.push({ value: `uf:${u.uf}`, label: `${u.nome} (${u.uf.toUpperCase()})` });
    const remotos = (q.data?.itens ?? [])
      .filter((i) => i.tipo !== "candidato" && permite(i.tipo))
      .map((i) => ({ value: `${i.nivel ?? i.tipo}:${i.id}`, label: `${i.titulo}${i.subtitulo ? ` — ${i.subtitulo}` : ""}` }));
    const todos = [...remotos, ...base];
    if (value && !todos.some((d) => d.value === value)) {
      const r = lerRecorte(value);
      todos.unshift({ value, label: rotulos[value] ?? (r ? nomeRecortePadrao(r.nivel, r.id) : value) });
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

interface CandidatoPickerProps extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: string | null;
  onChange: (v: string | null) => void;
  turno: number;
  cargo: number;
  uf?: string | null;
}

export function CandidatoPicker({ value, onChange, turno, cargo, uf, ...rest }: CandidatoPickerProps) {
  const q = useCandidatos(turno, cargo, cargo === 1 ? null : uf ?? null);
  const data = useMemo(() => {
    const d = (q.data ?? []).map((c) => ({ value: c.sqcand, label: `${c.nome_urna} (${c.numero}) · ${c.partido_sigla}${c.uf ? ` · ${c.uf.toUpperCase()}` : ""}` }));
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
