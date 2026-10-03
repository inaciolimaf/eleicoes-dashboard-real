import {
  ActionIcon,
  Alert,
  Button,
  ColorInput,
  Divider,
  Drawer,
  Group,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { IconLock, IconLockOpen, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useCandidatos } from "../api/hooks";
import type { Nivel } from "../api/types";
import { CandidatoPicker, RecortePicker, lerRecorte, valorRecorte } from "../components/common/Pickers";
import { OPCOES_CARGO } from "../lib/cargos";
import { useFiltroEfetivo } from "../lib/filtro-efetivo";
import { ufDoId } from "../lib/recortes";
import { dayjs } from "../lib/time";
import { CAMPOS_COMUNS, REGISTRO } from "../widgets/registro";
import type { CampoConfig } from "../widgets/tipos";
import type { FiltrosWidget, WidgetCfg } from "./schema";

function CampoCandidatos({ value, onChange, turno, cargo, uf }: { value: string[]; onChange: (v: string[]) => void; turno: number; cargo: number; uf: string | null }) {
  const q = useCandidatos(turno, cargo, cargo === 1 ? null : uf);
  return (
    <MultiSelect
      label="Candidatos (até 4)"
      data={(q.data ?? []).map((c) => ({ value: c.sqcand, label: `${c.nome_urna} (${c.numero}) · ${c.partido_sigla}` }))}
      value={value}
      onChange={onChange}
      maxValues={4}
      searchable
      clearable
    />
  );
}

function Campo({
  campo,
  valor,
  set,
  turno,
  cargo,
  uf,
}: {
  campo: CampoConfig;
  valor: unknown;
  set: (v: unknown) => void;
  turno: number;
  cargo: number;
  uf: string | null;
}) {
  switch (campo.tipo) {
    case "texto":
      return <TextInput label={campo.rotulo} value={(valor as string) ?? ""} onChange={(e) => set(e.currentTarget.value)} />;
    case "textarea":
      return <Textarea label={campo.rotulo} value={(valor as string) ?? ""} onChange={(e) => set(e.currentTarget.value)} autosize minRows={5} maxRows={14} />;
    case "numero":
      return (
        <NumberInput
          label={campo.rotulo}
          value={typeof valor === "number" ? valor : ""}
          onChange={(v) => set(typeof v === "number" ? v : undefined)}
          min={campo.min}
          max={campo.max}
        />
      );
    case "switch":
      return <Switch label={campo.rotulo} checked={!!valor} onChange={(e) => set(e.currentTarget.checked)} />;
    case "select":
      return <Select label={campo.rotulo} data={campo.opcoes ?? []} value={(valor as string) ?? null} onChange={(v) => set(v ?? undefined)} allowDeselect={false} />;
    case "multiselect":
      return (
        <MultiSelect
          label={campo.rotulo}
          data={campo.opcoes ?? []}
          value={Array.isArray(valor) ? (valor as string[]) : []}
          onChange={(v) => set(v)}
          clearable
          searchable
        />
      );
    case "cor":
      return (
        <ColorInput
          label={campo.rotulo}
          value={(valor as string) ?? ""}
          onChange={(v) => set(v || undefined)}
          swatches={["#3D7BFF", "#22C55E", "#F5A524", "#E5484D", "#8B5CF6", "#14B8A6", "#EC4899", "#F97316"]}
        />
      );
    case "candidato":
      return <CandidatoPicker label={campo.rotulo} value={(valor as string) ?? null} onChange={(v) => set(v ?? undefined)} turno={turno} cargo={cargo} uf={uf} />;
    case "candidatos":
      return <CampoCandidatos value={Array.isArray(valor) ? (valor as string[]) : []} onChange={set} turno={turno} cargo={cargo} uf={uf} />;
    case "recorte":
      return <RecortePicker label={campo.rotulo} value={(valor as string) ?? null} onChange={(v) => set(v ?? undefined)} />;
    case "local":
    case "secao": {
      const v = typeof valor === "string" && valor ? valorRecorte(campo.tipo, valor) : null;
      return (
        <RecortePicker
          label={campo.rotulo}
          tipos={[campo.tipo]}
          incluirBrasil={false}
          incluirUfs={false}
          value={v}
          onChange={(nv) => set(lerRecorte(nv)?.id ?? undefined)}
        />
      );
    }
    case "recortes": {
      const lista = Array.isArray(valor) ? (valor as string[]) : [];
      return (
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            {campo.rotulo}
          </Text>
          {lista.map((r, i) => (
            <Group key={i} gap={6} wrap="nowrap">
              <RecortePicker
                value={r}
                onChange={(nv) => set(nv ? lista.map((x, j) => (j === i ? nv : x)) : lista.filter((_, j) => j !== i))}
                style={{ flex: 1 }}
              />
              <ActionIcon variant="subtle" color="red" onClick={() => set(lista.filter((_, j) => j !== i))} aria-label="Remover recorte">
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
          {lista.length < 4 && (
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => set([...lista, "uf:sp"])} w="fit-content">
              Adicionar recorte
            </Button>
          )}
        </Stack>
      );
    }
    case "datahora":
      return (
        <DateTimePicker
          label={campo.rotulo}
          value={typeof valor === "string" && valor ? new Date(valor) : null}
          onChange={(d) => set(d ? dayjs(d).toISOString() : undefined)}
          valueFormat="DD/MM/YYYY HH:mm"
          clearable
        />
      );
  }
}

interface Props {
  widget: WidgetCfg | null;
  onClose: () => void;
  onSalvar: (w: WidgetCfg) => void;
}

/** Gaveta de configuração do widget: fonte (herdar/fixar), aparência e comportamento. */
export function GavetaConfig({ widget, onClose, onSalvar }: Props) {
  const [rascunho, setRascunho] = useState<WidgetCfg | null>(widget);
  useEffect(() => setRascunho(widget), [widget]);
  const fe = useFiltroEfetivo();
  if (!rascunho) return <Drawer opened={false} onClose={onClose} />;
  const def = REGISTRO[rascunho.tipo];
  const cfg = { ...def.padrao, ...rascunho.config };
  const setCfg = (k: string, v: unknown) =>
    setRascunho((r) => {
      if (!r) return r;
      const config = { ...r.config };
      if (v === undefined) delete config[k];
      else config[k] = v;
      return { ...r, config };
    });
  const filtros: FiltrosWidget = rascunho.filtros ?? {};
  const setFiltros = (p: Partial<FiltrosWidget>) => setRascunho((r) => (r ? { ...r, filtros: { ...(r.filtros ?? {}), ...p } } : r));
  const turno = (!rascunho.herda && filtros.turno) || fe.turno;
  const cargo = (!rascunho.herda && filtros.cargo) || fe.cargo;
  const recorteSel = !rascunho.herda && filtros.nivel && filtros.recorte ? valorRecorte(filtros.nivel, filtros.recorte) : null;
  const ufCtx = !rascunho.herda && filtros.nivel && filtros.recorte ? ufDoId(filtros.nivel as Nivel, filtros.recorte) : ufDoId(fe.nivel, fe.id);
  const tempoFixo = !rascunho.herda && filtros.tempo && filtros.tempo !== "agora";

  return (
    <Drawer
      opened={!!widget}
      onClose={onClose}
      position="right"
      size="md"
      title={
        <Group gap={8}>
          <def.icone size={18} />
          <Text fw={700}>Configurar · {def.nome}</Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Divider label="Fonte dos dados" labelPosition="left" />
        <SegmentedControl
          fullWidth
          value={rascunho.herda ? "herda" : "fixo"}
          onChange={(v) =>
            setRascunho((r) =>
              r
                ? {
                    ...r,
                    herda: v === "herda",
                    filtros: v === "herda" ? r.filtros : { cargo: fe.cargo, turno: fe.turno, nivel: fe.nivel, recorte: fe.id, tempo: "agora", ...(r.filtros ?? {}) },
                  }
                : r,
            )
          }
          data={[
            { value: "herda", label: (<Group gap={4} justify="center"><IconLockOpen size={14} />Herdar filtro do painel</Group>) },
            { value: "fixo", label: (<Group gap={4} justify="center"><IconLock size={14} />Fixar</Group>) },
          ]}
        />
        {!rascunho.herda && (
          <Stack gap="sm">
            <Group grow>
              <Select
                label="Turno"
                data={[
                  { value: "1", label: "1º turno" },
                  { value: "2", label: "2º turno" },
                ]}
                value={String(filtros.turno ?? fe.turno)}
                onChange={(v) => setFiltros({ turno: Number(v ?? 1) })}
                allowDeselect={false}
              />
              <Select
                label="Cargo"
                data={OPCOES_CARGO.map((o) => ({ value: o.valor, label: o.rotulo }))}
                value={String(filtros.cargo === 8 ? 7 : filtros.cargo ?? fe.cargo)}
                onChange={(v) => setFiltros({ cargo: Number(v ?? 1) })}
                allowDeselect={false}
              />
            </Group>
            <RecortePicker
              label="Recorte"
              value={recorteSel}
              onChange={(v) => {
                const r = lerRecorte(v);
                setFiltros(r ? { nivel: r.nivel, recorte: r.id } : { nivel: undefined, recorte: undefined });
              }}
            />
            <SegmentedControl
              value={tempoFixo ? "fixo" : "agora"}
              onChange={(v) => setFiltros({ tempo: v === "agora" ? "agora" : dayjs().startOf("minute").toISOString() })}
              data={[
                { value: "agora", label: "Ao vivo" },
                { value: "fixo", label: "Congelar no tempo" },
              ]}
            />
            {tempoFixo && (
              <DateTimePicker
                label="Instante (horário de Brasília)"
                value={filtros.tempo ? new Date(filtros.tempo) : null}
                onChange={(d) => setFiltros({ tempo: d ? dayjs(d).toISOString() : "agora" })}
                valueFormat="DD/MM/YYYY HH:mm"
                withSeconds={false}
              />
            )}
          </Stack>
        )}

        <Divider label="Aparência e comportamento" labelPosition="left" />
        {CAMPOS_COMUNS.map((c) => (
          <Campo key={c.chave} campo={c} valor={c.chave === "clique" ? cfg[c.chave] ?? "filtrar" : cfg[c.chave]} set={(v) => setCfg(c.chave, v)} turno={turno} cargo={cargo} uf={ufCtx} />
        ))}
        {def.campos
          .filter((c) => !c.quando || c.quando(cfg))
          .map((c) => (
            <Campo key={c.chave} campo={c} valor={cfg[c.chave]} set={(v) => setCfg(c.chave, v)} turno={turno} cargo={cargo} uf={ufCtx} />
          ))}
        {def.campos.length === 0 && (
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
              onSalvar(rascunho);
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
