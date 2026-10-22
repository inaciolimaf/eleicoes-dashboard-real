import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  MultiSelect,
  NumberInput,
  Pagination,
  Progress,
  RangeSlider,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useDebouncedValue } from "@mantine/hooks";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconChevronDown,
  IconChevronRight,
  IconFilter,
  IconFilterOff,
  IconSearch,
} from "@tabler/icons-react";
import { memo, useMemo, useState } from "react";
import type { ChildItemDto, Level } from "../../../api/models";
import { useChildren } from "../hooks";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { useLive } from "../../realtime";
import { topic } from "../../realtime";
import { STATUS_COLORS, STATUS_LABELS } from "../../../lib/palettes";
import { fmtCompact, fmtInt, fmtPP, fmtPct, stripAccents } from "../../../lib/formatting";
import { LEVEL_PLURAL_LABELS, REGIONS, UFS, childLevel } from "../../../lib/geo-areas";
import { useCandidateColor } from "../../../lib/useColor";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { useFlash } from "../../../components/Num";
import { asLevel } from "../../../lib/geo-areas";

export type ColumnId =
  | "nome"
  | "uf"
  | "regiao"
  | "pct_secoes"
  | "lider"
  | "segundo"
  | "margem_pp"
  | "votos_validos"
  | "eleitorado"
  | "comparecimento"
  | "abstencao"
  | "capital"
  | "partido";

export const COLUMNS: { id: ColumnId; rotulo: string; num?: boolean }[] = [
  { id: "nome", rotulo: "Nome" },
  { id: "uf", rotulo: "UF" },
  { id: "regiao", rotulo: "Região" },
  { id: "pct_secoes", rotulo: "% apurado", num: true },
  { id: "lider", rotulo: "Vencedor" },
  { id: "segundo", rotulo: "2º colocado" },
  { id: "margem_pp", rotulo: "Margem", num: true },
  { id: "votos_validos", rotulo: "Votos válidos", num: true },
  { id: "eleitorado", rotulo: "Eleitorado", num: true },
  { id: "comparecimento", rotulo: "Comparec.", num: true },
  { id: "abstencao", rotulo: "Abstenção", num: true },
  { id: "capital", rotulo: "Capital" },
  { id: "partido", rotulo: "Partido + votado" },
];

export const DEFAULT_COLUMNS: ColumnId[] = [
  "nome",
  "pct_secoes",
  "lider",
  "margem_pp",
  "votos_validos",
  "eleitorado",
];

function valorOrdenacao(it: ChildItemDto, c: ColumnId): number | string {
  switch (c) {
    case "nome":
      return stripAccents(it.name);
    case "uf":
      return it.state_code ?? "";
    case "regiao":
      return it.region ?? "";
    case "pct_secoes":
      return it.pct_sections;
    case "lider":
      return it.leader?.ballot_name ?? "";
    case "segundo":
      return it.second?.ballot_name ?? "";
    case "margem_pp":
      return it.margin_pp ?? -1;
    case "votos_validos":
      return it.valid_votes;
    case "eleitorado":
      return it.electorate;
    case "comparecimento":
      return it.electorate ? it.turnout / it.electorate : 0;
    case "abstencao":
      return it.pct_abstention;
    case "capital":
      return it.is_capital ? 1 : 0;
    case "partido":
      return it.leader_party?.abbreviation ?? "";
  }
}

const PORTES = [
  { ate: 10_000, rotulo: "Até 10 mil eleitores" },
  { ate: 50_000, rotulo: "10 mil – 50 mil" },
  { ate: 200_000, rotulo: "50 mil – 200 mil" },
  { ate: 1_000_000, rotulo: "200 mil – 1 milhão" },
  { ate: Infinity, rotulo: "Mais de 1 milhão" },
];
const porte = (n: number) => PORTES.find((p) => n < p.ate)?.rotulo ?? PORTES[PORTES.length - 1].rotulo;

type Agrupar = "nenhum" | "regiao" | "uf" | "porte";

interface Filtros {
  busca: string;
  ufs: string[];
  regioes: string[];
  apurado: [number, number];
  vencedor: string | null;
  margem: [number, number];
  capital: "todos" | "capital" | "interior";
  eleitoradoMin: number | null;
}

const DEFAULT_FILTERS: Filtros = {
  busca: "",
  ufs: [],
  regioes: [],
  apurado: [0, 100],
  vencedor: null,
  margem: [0, 100],
  capital: "todos",
  eleitoradoMin: null,
};

const Celula = memo(function Celula({
  it,
  c,
  corCand,
}: {
  it: ChildItemDto;
  c: ColumnId;
  corCand: ReturnType<typeof useCandidateColor>;
}) {
  switch (c) {
    case "nome":
      return (
        <Group gap={6} wrap="nowrap">
          <Tooltip label={STATUS_LABELS[it.status]}>
            <Box
              w={8}
              h={8}
              style={{ borderRadius: 8, background: STATUS_COLORS[it.status], flexShrink: 0 }}
            />
          </Tooltip>
          <Text size="sm" fw={600} lineClamp={1}>
            {it.name}
          </Text>
          {it.is_capital && (
            <Badge size="xs" variant="light" color="gray">
              capital
            </Badge>
          )}
        </Group>
      );
    case "uf":
      return <Text size="sm">{(it.state_code ?? "").toUpperCase()}</Text>;
    case "regiao":
      return <Text size="sm">{it.region ?? "—"}</Text>;
    case "pct_secoes":
      return (
        <Stack gap={2} miw={70}>
          <Text size="xs" className="num" ta="right">
            {fmtPct(it.pct_sections, 1)}
          </Text>
          <Progress value={it.pct_sections} size={4} color={it.pct_sections >= 100 ? "green" : "eleicao"} />
        </Stack>
      );
    case "lider":
    case "segundo": {
      const l = c === "lider" ? it.leader : it.second;
      if (!l)
        return (
          <Text size="sm" c="dimmed">
            —
          </Text>
        );
      const cor = corCand(l.tse_candidate_id, l.color);
      return (
        <Stack gap={2} miw={110}>
          <Group gap={6} wrap="nowrap" justify="space-between">
            <Text size="sm" fw={c === "lider" ? 700 : 500} lineClamp={1}>
              {l.ballot_name}
            </Text>
            <Text size="xs" className="num">
              {fmtPct(l.pct, 1)}
            </Text>
          </Group>
          <Box className="barra-trilho" style={{ height: 4 }}>
            <Box
              className="barra-preenchida"
              style={{ width: `${Math.min(100, l.pct)}%`, background: cor }}
            />
          </Box>
        </Stack>
      );
    }
    case "margem_pp":
      return (
        <Text size="sm" className="num" ta="right">
          {fmtPP(it.margin_pp)}
        </Text>
      );
    case "votos_validos":
      return (
        <Text size="sm" className="num" ta="right">
          {fmtInt(it.valid_votes)}
        </Text>
      );
    case "eleitorado":
      return (
        <Text size="sm" className="num" ta="right">
          {fmtInt(it.electorate)}
        </Text>
      );
    case "comparecimento":
      return (
        <Text size="sm" className="num" ta="right">
          {it.electorate ? fmtPct((it.turnout / it.electorate) * 100, 1) : "—"}
        </Text>
      );
    case "abstencao":
      return (
        <Text size="sm" className="num" ta="right">
          {fmtPct(it.pct_abstention, 1)}
        </Text>
      );
    case "capital":
      return <Text size="sm">{it.is_capital ? "Sim" : "Não"}</Text>;
    case "partido":
      return it.leader_party ? (
        <Group gap={6} wrap="nowrap">
          <Box w={10} h={10} style={{ borderRadius: 3, background: it.leader_party.color }} />
          <Text size="sm">{it.leader_party.abbreviation}</Text>
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          —
        </Text>
      );
  }
});

function Linha({
  it,
  colunas,
  corCand,
  onClick,
}: {
  it: ChildItemDto;
  colunas: ColumnId[];
  corCand: ReturnType<typeof useCandidateColor>;
  onClick?: () => void;
}) {
  const flash = useFlash(`${it.pct_sections}|${it.leader?.tse_candidate_id}|${it.valid_votes}`);
  return (
    <Table.Tr
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : undefined }}
      className={flash ? "glow" : undefined}
    >
      {colunas.map((c) => (
        <Table.Td key={c}>
          <Celula it={it} c={c} corCand={corCand} />
        </Table.Td>
      ))}
    </Table.Tr>
  );
}

export interface GeoAreaTableProps {
  nivel?: Level;
  id?: string;
  filhos?: Level | null;
  colunas?: ColumnId[];
  topN?: number;
  onSelecionar?: (nivel: Level, id: string, nome: string) => void;
  mostrarFiltros?: boolean;
  alturaMax?: number | string;
  porPagina?: number;
}

export function GeoAreaTable({
  nivel: nivelProp,
  id: idProp,
  filhos = null,
  colunas: colunasProp,
  topN,
  onSelecionar,
  mostrarFiltros = true,
  alturaMax,
  porPagina = 50,
}: GeoAreaTableProps) {
  const fe = useEffectiveFilter();
  const nivel = nivelProp ?? fe.nivel;
  const id = idProp ?? fe.id;
  const q = useChildren({ turno: fe.turno, cargo: fe.cargo, nivel, id, t: fe.t, filhos });
  useLive([topic.children(fe.turno, fe.cargo, nivel, id, filhos)]);
  const corCand = useCandidateColor();

  const [filtros, setFiltros] = useState<Filtros>(DEFAULT_FILTERS);
  const [buscaDeb] = useDebouncedValue(filtros.busca, 200);
  const [ordem, setOrdem] = useState<{ col: ColumnId; desc: boolean }>({ col: "eleitorado", desc: true });
  const [pagina, setPagina] = useState(1);
  const [agrupar, setAgrupar] = useState<Agrupar>("nenhum");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [filtrosAbertos, { toggle: toggleFiltros }] = useDisclosure(false);

  const nivelFilhos = asLevel(q.data?.child_level ?? filhos ?? childLevel(nivel) ?? "municipality");
  const temUf = nivelFilhos !== "state" && nivel === "country";
  const colunas = useMemo(() => {
    let c = colunasProp?.length ? colunasProp : DEFAULT_COLUMNS;
    if (temUf && !c.includes("uf")) c = [c[0], "uf", ...c.slice(1)];
    return c;
  }, [colunasProp, temUf]);

  const set = (p: Partial<Filtros>) => {
    setFiltros((f) => ({ ...f, ...p }));
    setPagina(1);
  };

  const filtrados = useMemo(() => {
    const itens = q.data?.items ?? [];
    const b = stripAccents(buscaDeb.trim());
    const r = itens.filter((it) => {
      if (b && !stripAccents(it.name).includes(b)) return false;
      if (filtros.ufs.length && !filtros.ufs.includes(it.state_code ?? "")) return false;
      if (filtros.regioes.length && !filtros.regioes.includes(it.region ?? "")) return false;
      if (it.pct_sections < filtros.apurado[0] || it.pct_sections > filtros.apurado[1]) return false;
      if (filtros.vencedor && it.leader?.tse_candidate_id !== filtros.vencedor) return false;
      if (filtros.margem[0] > 0 || filtros.margem[1] < 100) {
        const m = it.margin_pp ?? 0;
        if (m < filtros.margem[0] || m > filtros.margem[1]) return false;
      }
      if (filtros.capital === "capital" && !it.is_capital) return false;
      if (filtros.capital === "interior" && it.is_capital) return false;
      if (filtros.eleitoradoMin && it.electorate < filtros.eleitoradoMin) return false;
      return true;
    });
    const dir = ordem.desc ? -1 : 1;
    r.sort((a, b2) => {
      const va = valorOrdenacao(a, ordem.col);
      const vb = valorOrdenacao(b2, ordem.col);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
    return topN && topN > 0 ? r.slice(0, topN) : r;
  }, [q.data, buscaDeb, filtros, ordem, topN]);

  const grupos = useMemo(() => {
    if (agrupar === "nenhum") return null;
    const m = new Map<string, ChildItemDto[]>();
    for (const it of filtrados) {
      const k =
        agrupar === "regiao"
          ? (it.region ?? "—")
          : agrupar === "uf"
            ? (it.state_code ?? "").toUpperCase()
            : porte(it.electorate);
      const l = m.get(k);
      if (l) l.push(it);
      else m.set(k, [it]);
    }
    const ordemChaves =
      agrupar === "porte"
        ? PORTES.map((p) => p.rotulo)
        : agrupar === "regiao"
          ? REGIONS
          : [...m.keys()].sort();
    return ordemChaves
      .filter((k) => m.has(k))
      .concat([...m.keys()].filter((k) => !ordemChaves.includes(k)))
      .map((k) => {
        const itens = m.get(k)!;
        const eleit = itens.reduce((s, i) => s + i.electorate, 0);
        const secW = itens.reduce((s, i) => s + i.pct_sections * i.electorate, 0);
        const vit = new Map<string, { nome: string; cor: string; n: number }>();
        for (const i of itens)
          if (i.leader) {
            const x = vit.get(i.leader.tse_candidate_id);
            if (x) x.n++;
            else
              vit.set(i.leader.tse_candidate_id, {
                nome: i.leader.ballot_name,
                cor: corCand(i.leader.tse_candidate_id, i.leader.color),
                n: 1,
              });
          }
        return {
          chave: k,
          itens,
          eleitorado: eleit,
          pct: eleit ? secW / eleit : 0,
          validos: itens.reduce((s, i) => s + i.valid_votes, 0),
          vitorias: [...vit.values()].sort((a, b) => b.n - a.n).slice(0, 3),
        };
      });
  }, [agrupar, filtrados, corCand]);

  const ativos =
    (filtros.ufs.length ? 1 : 0) +
    (filtros.regioes.length ? 1 : 0) +
    (filtros.apurado[0] > 0 || filtros.apurado[1] < 100 ? 1 : 0) +
    (filtros.vencedor ? 1 : 0) +
    (filtros.margem[0] > 0 || filtros.margem[1] < 100 ? 1 : 0) +
    (filtros.capital !== "todos" ? 1 : 0) +
    (filtros.eleitoradoMin ? 1 : 0);

  if (q.isLoading) return <Loading linhas={6} />;
  if (q.error) return <ErrorView erro={q.error} onRetry={() => q.refetch()} />;
  if (!q.data || q.data.items.length === 0)
    return <NoData titulo={`Sem ${LEVEL_PLURAL_LABELS[nivelFilhos].toLowerCase()} com dados`} />;

  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const pag = Math.min(pagina, paginas);
  const visiveis = filtrados.slice((pag - 1) * porPagina, pag * porPagina);
  const clicar = (it: ChildItemDto) =>
    onSelecionar ? () => onSelecionar(asLevel(it.level), it.id, it.name) : undefined;

  const cabecalho = (
    <Table.Thead style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--mantine-color-body)" }}>
      <Table.Tr>
        {colunas.map((c) => {
          const meta = COLUMNS.find((x) => x.id === c)!;
          const ativo = ordem.col === c;
          return (
            <Table.Th key={c} style={{ whiteSpace: "nowrap" }}>
              <UnstyledButton
                onClick={() => setOrdem((o) => ({ col: c, desc: o.col === c ? !o.desc : !!meta.num }))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginLeft: meta.num ? "auto" : undefined,
                }}
              >
                <Text size="xs" fw={700} tt="uppercase" c={ativo ? undefined : "dimmed"}>
                  {meta.rotulo}
                </Text>
                {ativo ? (
                  ordem.desc ? (
                    <IconArrowDown size={12} />
                  ) : (
                    <IconArrowUp size={12} />
                  )
                ) : (
                  <IconArrowsSort size={12} opacity={0.4} />
                )}
              </UnstyledButton>
            </Table.Th>
          );
        })}
      </Table.Tr>
    </Table.Thead>
  );

  return (
    <Stack gap="xs">
      {mostrarFiltros && (
        <>
          <Group gap="xs" wrap="wrap">
            <TextInput
              size="xs"
              placeholder={`Buscar ${LEVEL_PLURAL_LABELS[nivelFilhos].toLowerCase()}…`}
              leftSection={<IconSearch size={14} />}
              value={filtros.busca}
              onChange={(e) => set({ busca: e.currentTarget.value })}
              style={{ flex: 1, minWidth: 160 }}
            />
            <Button
              size="xs"
              variant={ativos ? "light" : "default"}
              leftSection={<IconFilter size={14} />}
              rightSection={
                ativos ? (
                  <Badge size="xs" circle>
                    {ativos}
                  </Badge>
                ) : undefined
              }
              onClick={toggleFiltros}
            >
              Filtros
            </Button>
            <Select
              size="xs"
              w={150}
              value={agrupar}
              onChange={(v) => setAgrupar((v as Agrupar) ?? "nenhum")}
              data={[
                { value: "nenhum", label: "Sem agrupamento" },
                { value: "regiao", label: "Agrupar por região" },
                ...(temUf ? [{ value: "uf", label: "Agrupar por UF" }] : []),
                { value: "porte", label: "Agrupar por porte" },
              ]}
              allowDeselect={false}
              aria-label="Agrupamento"
            />
            {ativos > 0 && (
              <Tooltip label="Limpar filtros">
                <ActionIcon
                  variant="subtle"
                  size="md"
                  onClick={() => set(DEFAULT_FILTERS)}
                  aria-label="Limpar filtros"
                >
                  <IconFilterOff size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          <Collapse in={filtrosAbertos}>
            <SimpleGrid
              cols={{ base: 1, xs: 2, md: 4 }}
              spacing="sm"
              p="xs"
              style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 10 }}
            >
              {temUf && (
                <MultiSelect
                  size="xs"
                  label="UF"
                  data={UFS.map((u) => ({ value: u.uf, label: `${u.uf.toUpperCase()} · ${u.nome}` }))}
                  value={filtros.ufs}
                  onChange={(v) => set({ ufs: v })}
                  searchable
                  clearable
                />
              )}
              <MultiSelect
                size="xs"
                label="Região"
                data={REGIONS}
                value={filtros.regioes}
                onChange={(v) => set({ regioes: v })}
                clearable
              />
              <Select
                size="xs"
                label="Vencedor"
                data={(q.data.candidates ?? []).map((c) => ({
                  value: c.tse_candidate_id,
                  label: `${c.ballot_name} (${c.wins})`,
                }))}
                value={filtros.vencedor}
                onChange={(v) => set({ vencedor: v })}
                clearable
                searchable
              />
              <Stack gap={2}>
                <Text size="xs" fw={500}>
                  Capital / interior
                </Text>
                <SegmentedControl
                  size="xs"
                  value={filtros.capital}
                  onChange={(v) => set({ capital: v as Filtros["capital"] })}
                  data={[
                    { value: "todos", label: "Todos" },
                    { value: "capital", label: "Capitais" },
                    { value: "interior", label: "Interior" },
                  ]}
                />
              </Stack>
              <Stack gap={2}>
                <Text size="xs" fw={500}>
                  % apurado: {filtros.apurado[0]}–{filtros.apurado[1]}%
                </Text>
                <RangeSlider
                  size="sm"
                  min={0}
                  max={100}
                  step={5}
                  value={filtros.apurado}
                  onChange={(v) => set({ apurado: v })}
                  label={(v) => `${v}%`}
                />
              </Stack>
              <Stack gap={2}>
                <Text size="xs" fw={500}>
                  Margem: {filtros.margem[0]}–{filtros.margem[1]} p.p.
                </Text>
                <RangeSlider
                  size="sm"
                  min={0}
                  max={100}
                  step={1}
                  value={filtros.margem}
                  onChange={(v) => set({ margem: v })}
                  label={(v) => `${v} p.p.`}
                />
              </Stack>
              <NumberInput
                size="xs"
                label="Eleitorado mínimo"
                value={filtros.eleitoradoMin ?? ""}
                onChange={(v) => set({ eleitoradoMin: typeof v === "number" ? v : null })}
                thousandSeparator="."
                decimalSeparator=","
                min={0}
                step={10000}
              />
            </SimpleGrid>
          </Collapse>
        </>
      )}

      <Text size="xs" c="dimmed">
        {fmtInt(filtrados.length)} de {fmtInt(q.data.items.length)}{" "}
        {LEVEL_PLURAL_LABELS[nivelFilhos].toLowerCase()}
      </Text>

      <ScrollArea.Autosize mah={alturaMax ?? 560} type="auto" className="scroll-fino">
        <Table
          highlightOnHover
          verticalSpacing={6}
          horizontalSpacing="xs"
          stickyHeader
          miw={colunas.length * 95}
        >
          {cabecalho}
          <Table.Tbody>
            {grupos
              ? grupos.map((g) => {
                  const aberto = !!abertos[g.chave];
                  return (
                    <GrupoLinhas
                      key={g.chave}
                      g={g}
                      aberto={aberto}
                      onToggle={() => setAbertos((a) => ({ ...a, [g.chave]: !aberto }))}
                      colunas={colunas}
                      corCand={corCand}
                      clicar={clicar}
                    />
                  );
                })
              : visiveis.map((it) => (
                  <Linha key={it.id} it={it} colunas={colunas} corCand={corCand} onClick={clicar(it)} />
                ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
      {!grupos && paginas > 1 && (
        <Group justify="center">
          <Pagination size="sm" total={paginas} value={pag} onChange={setPagina} siblings={1} />
        </Group>
      )}
    </Stack>
  );
}

function GrupoLinhas({
  g,
  aberto,
  onToggle,
  colunas,
  corCand,
  clicar,
}: {
  g: {
    chave: string;
    itens: ChildItemDto[];
    eleitorado: number;
    pct: number;
    validos: number;
    vitorias: { nome: string; cor: string; n: number }[];
  };
  aberto: boolean;
  onToggle: () => void;
  colunas: ColumnId[];
  corCand: ReturnType<typeof useCandidateColor>;
  clicar: (it: ChildItemDto) => (() => void) | undefined;
}) {
  const [limite, setLimite] = useState(100);
  return (
    <>
      <Table.Tr
        onClick={onToggle}
        style={{ cursor: "pointer", background: "var(--mantine-color-default-hover)" }}
      >
        <Table.Td colSpan={colunas.length}>
          <Group gap="sm" wrap="wrap">
            {aberto ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <Text fw={700} size="sm">
              {g.chave}
            </Text>
            <Text size="xs" c="dimmed">
              {fmtInt(g.itens.length)} itens · {fmtCompact(g.eleitorado)} eleitores · {fmtPct(g.pct, 1)}{" "}
              apurado · {fmtCompact(g.validos)} válidos
            </Text>
            <Group gap={4}>
              {g.vitorias.map((v) => (
                <Badge key={v.nome} size="xs" variant="dot" color={v.cor}>
                  {v.nome} {v.n}
                </Badge>
              ))}
            </Group>
          </Group>
        </Table.Td>
      </Table.Tr>
      {aberto &&
        g.itens
          .slice(0, limite)
          .map((it) => (
            <Linha key={it.id} it={it} colunas={colunas} corCand={corCand} onClick={clicar(it)} />
          ))}
      {aberto && g.itens.length > limite && (
        <Table.Tr>
          <Table.Td colSpan={colunas.length}>
            <Button size="compact-xs" variant="subtle" onClick={() => setLimite((l) => l + 200)}>
              Mostrar mais ({fmtInt(g.itens.length - limite)} restantes)
            </Button>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}
