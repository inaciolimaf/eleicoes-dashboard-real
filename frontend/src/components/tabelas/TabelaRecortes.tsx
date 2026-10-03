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
import type { ItemFilho, Nivel } from "../../api/types";
import { useFilhos } from "../../api/hooks";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { useLive } from "../../realtime/useLive";
import { topico } from "../../realtime/topicos";
import { COR_STATUS, ROTULO_STATUS } from "../../lib/cores";
import { fmtCompact, fmtInt, fmtPP, fmtPct, semAcento } from "../../lib/format";
import { NIVEL_PLURAL, REGIOES, UFS, nivelFilho } from "../../lib/recortes";
import { useCorCandidato } from "../../lib/useCor";
import { Carregando, ErroView, SemDados } from "../common/Estados";
import { useFlash } from "../common/Num";

export type ColunaId =
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

export const COLUNAS: { id: ColunaId; rotulo: string; num?: boolean }[] = [
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

export const COLUNAS_PADRAO: ColunaId[] = ["nome", "pct_secoes", "lider", "margem_pp", "votos_validos", "eleitorado"];

function valorOrdenacao(it: ItemFilho, c: ColunaId): number | string {
  switch (c) {
    case "nome": return semAcento(it.nome);
    case "uf": return it.uf;
    case "regiao": return it.regiao ?? "";
    case "pct_secoes": return it.pct_secoes;
    case "lider": return it.lider?.nome_urna ?? "";
    case "segundo": return it.segundo?.nome_urna ?? "";
    case "margem_pp": return it.margem_pp ?? -1;
    case "votos_validos": return it.votos_validos;
    case "eleitorado": return it.eleitorado;
    case "comparecimento": return it.eleitorado ? it.comparecimento / it.eleitorado : 0;
    case "abstencao": return it.pct_abstencao;
    case "capital": return it.capital ? 1 : 0;
    case "partido": return it.partido_lider?.sigla ?? "";
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

const FILTROS_PADRAO: Filtros = {
  busca: "",
  ufs: [],
  regioes: [],
  apurado: [0, 100],
  vencedor: null,
  margem: [0, 100],
  capital: "todos",
  eleitoradoMin: null,
};

const Celula = memo(function Celula({ it, c, corCand }: { it: ItemFilho; c: ColunaId; corCand: ReturnType<typeof useCorCandidato> }) {
  switch (c) {
    case "nome":
      return (
        <Group gap={6} wrap="nowrap">
          <Tooltip label={ROTULO_STATUS[it.status]}>
            <Box w={8} h={8} style={{ borderRadius: 8, background: COR_STATUS[it.status], flexShrink: 0 }} />
          </Tooltip>
          <Text size="sm" fw={600} lineClamp={1}>
            {it.nome}
          </Text>
          {it.capital && (
            <Badge size="xs" variant="light" color="gray">
              capital
            </Badge>
          )}
        </Group>
      );
    case "uf":
      return <Text size="sm">{it.uf.toUpperCase()}</Text>;
    case "regiao":
      return <Text size="sm">{it.regiao ?? "—"}</Text>;
    case "pct_secoes":
      return (
        <Stack gap={2} miw={70}>
          <Text size="xs" className="num" ta="right">
            {fmtPct(it.pct_secoes, 1)}
          </Text>
          <Progress value={it.pct_secoes} size={4} color={it.pct_secoes >= 100 ? "green" : "eleicao"} />
        </Stack>
      );
    case "lider":
    case "segundo": {
      const l = c === "lider" ? it.lider : it.segundo;
      if (!l) return <Text size="sm" c="dimmed">—</Text>;
      const cor = corCand(l.sqcand, l.cor);
      return (
        <Stack gap={2} miw={110}>
          <Group gap={6} wrap="nowrap" justify="space-between">
            <Text size="sm" fw={c === "lider" ? 700 : 500} lineClamp={1}>
              {l.nome_urna}
            </Text>
            <Text size="xs" className="num">
              {fmtPct(l.pct, 1)}
            </Text>
          </Group>
          <Box className="barra-trilho" style={{ height: 4 }}>
            <Box className="barra-preenchida" style={{ width: `${Math.min(100, l.pct)}%`, background: cor }} />
          </Box>
        </Stack>
      );
    }
    case "margem_pp":
      return <Text size="sm" className="num" ta="right">{fmtPP(it.margem_pp)}</Text>;
    case "votos_validos":
      return <Text size="sm" className="num" ta="right">{fmtInt(it.votos_validos)}</Text>;
    case "eleitorado":
      return <Text size="sm" className="num" ta="right">{fmtInt(it.eleitorado)}</Text>;
    case "comparecimento":
      return (
        <Text size="sm" className="num" ta="right">
          {it.eleitorado ? fmtPct((it.comparecimento / it.eleitorado) * 100, 1) : "—"}
        </Text>
      );
    case "abstencao":
      return <Text size="sm" className="num" ta="right">{fmtPct(it.pct_abstencao, 1)}</Text>;
    case "capital":
      return <Text size="sm">{it.capital ? "Sim" : "Não"}</Text>;
    case "partido":
      return it.partido_lider ? (
        <Group gap={6} wrap="nowrap">
          <Box w={10} h={10} style={{ borderRadius: 3, background: it.partido_lider.cor }} />
          <Text size="sm">{it.partido_lider.sigla}</Text>
        </Group>
      ) : (
        <Text size="sm" c="dimmed">—</Text>
      );
  }
});

function Linha({
  it,
  colunas,
  corCand,
  onClick,
}: {
  it: ItemFilho;
  colunas: ColunaId[];
  corCand: ReturnType<typeof useCorCandidato>;
  onClick?: () => void;
}) {
  const flash = useFlash(`${it.pct_secoes}|${it.lider?.sqcand}|${it.votos_validos}`);
  return (
    <Table.Tr onClick={onClick} style={{ cursor: onClick ? "pointer" : undefined }} className={flash ? "glow" : undefined}>
      {colunas.map((c) => (
        <Table.Td key={c}>
          <Celula it={it} c={c} corCand={corCand} />
        </Table.Td>
      ))}
    </Table.Tr>
  );
}

export interface TabelaRecortesProps {
  nivel?: Nivel;
  id?: string;
  filhos?: Nivel | null;
  colunas?: ColunaId[];
  topN?: number;
  onSelecionar?: (nivel: Nivel, id: string, nome: string) => void;
  mostrarFiltros?: boolean;
  alturaMax?: number | string;
  porPagina?: number;
}

export function TabelaRecortes({
  nivel: nivelProp,
  id: idProp,
  filhos = null,
  colunas: colunasProp,
  topN,
  onSelecionar,
  mostrarFiltros = true,
  alturaMax,
  porPagina = 50,
}: TabelaRecortesProps) {
  const fe = useFiltroEfetivo();
  const nivel = nivelProp ?? fe.nivel;
  const id = idProp ?? fe.id;
  const q = useFilhos({ turno: fe.turno, cargo: fe.cargo, nivel, id, t: fe.t, filhos });
  useLive([topico.filhos(fe.turno, fe.cargo, nivel, id, filhos)]);
  const corCand = useCorCandidato();

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [buscaDeb] = useDebouncedValue(filtros.busca, 200);
  const [ordem, setOrdem] = useState<{ col: ColunaId; desc: boolean }>({ col: "eleitorado", desc: true });
  const [pagina, setPagina] = useState(1);
  const [agrupar, setAgrupar] = useState<Agrupar>("nenhum");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [filtrosAbertos, { toggle: toggleFiltros }] = useDisclosure(false);

  const nivelFilhos = q.data?.nivel_filhos ?? filhos ?? nivelFilho(nivel) ?? "municipio";
  const temUf = nivelFilhos !== "uf" && nivel === "br";
  const colunas = useMemo(() => {
    let c = colunasProp?.length ? colunasProp : COLUNAS_PADRAO;
    if (temUf && !c.includes("uf")) c = [c[0], "uf", ...c.slice(1)];
    return c;
  }, [colunasProp, temUf]);

  const set = (p: Partial<Filtros>) => {
    setFiltros((f) => ({ ...f, ...p }));
    setPagina(1);
  };

  const filtrados = useMemo(() => {
    const itens = q.data?.itens ?? [];
    const b = semAcento(buscaDeb.trim());
    const r = itens.filter((it) => {
      if (b && !semAcento(it.nome).includes(b)) return false;
      if (filtros.ufs.length && !filtros.ufs.includes(it.uf)) return false;
      if (filtros.regioes.length && !filtros.regioes.includes(it.regiao ?? "")) return false;
      if (it.pct_secoes < filtros.apurado[0] || it.pct_secoes > filtros.apurado[1]) return false;
      if (filtros.vencedor && it.lider?.sqcand !== filtros.vencedor) return false;
      if (filtros.margem[0] > 0 || filtros.margem[1] < 100) {
        const m = it.margem_pp ?? 0;
        if (m < filtros.margem[0] || m > filtros.margem[1]) return false;
      }
      if (filtros.capital === "capital" && !it.capital) return false;
      if (filtros.capital === "interior" && it.capital) return false;
      if (filtros.eleitoradoMin && it.eleitorado < filtros.eleitoradoMin) return false;
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
    const m = new Map<string, ItemFilho[]>();
    for (const it of filtrados) {
      const k = agrupar === "regiao" ? it.regiao ?? "—" : agrupar === "uf" ? it.uf.toUpperCase() : porte(it.eleitorado);
      const l = m.get(k);
      if (l) l.push(it);
      else m.set(k, [it]);
    }
    const ordemChaves = agrupar === "porte" ? PORTES.map((p) => p.rotulo) : agrupar === "regiao" ? REGIOES : [...m.keys()].sort();
    return ordemChaves.filter((k) => m.has(k)).concat([...m.keys()].filter((k) => !ordemChaves.includes(k))).map((k) => {
      const itens = m.get(k)!;
      const eleit = itens.reduce((s, i) => s + i.eleitorado, 0);
      const secW = itens.reduce((s, i) => s + i.pct_secoes * i.eleitorado, 0);
      const vit = new Map<string, { nome: string; cor: string; n: number }>();
      for (const i of itens)
        if (i.lider) {
          const x = vit.get(i.lider.sqcand);
          if (x) x.n++;
          else vit.set(i.lider.sqcand, { nome: i.lider.nome_urna, cor: corCand(i.lider.sqcand, i.lider.cor), n: 1 });
        }
      return {
        chave: k,
        itens,
        eleitorado: eleit,
        pct: eleit ? secW / eleit : 0,
        validos: itens.reduce((s, i) => s + i.votos_validos, 0),
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

  if (q.isLoading) return <Carregando linhas={6} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  if (!q.data || q.data.itens.length === 0) return <SemDados titulo={`Sem ${NIVEL_PLURAL[nivelFilhos].toLowerCase()} com dados`} />;

  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const pag = Math.min(pagina, paginas);
  const visiveis = filtrados.slice((pag - 1) * porPagina, pag * porPagina);
  const clicar = (it: ItemFilho) => (onSelecionar ? () => onSelecionar(it.nivel, it.id, it.nome) : undefined);

  const cabecalho = (
    <Table.Thead style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--mantine-color-body)" }}>
      <Table.Tr>
        {colunas.map((c) => {
          const meta = COLUNAS.find((x) => x.id === c)!;
          const ativo = ordem.col === c;
          return (
            <Table.Th key={c} style={{ whiteSpace: "nowrap" }}>
              <UnstyledButton
                onClick={() => setOrdem((o) => ({ col: c, desc: o.col === c ? !o.desc : !!meta.num }))}
                style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: meta.num ? "auto" : undefined }}
              >
                <Text size="xs" fw={700} tt="uppercase" c={ativo ? undefined : "dimmed"}>
                  {meta.rotulo}
                </Text>
                {ativo ? (ordem.desc ? <IconArrowDown size={12} /> : <IconArrowUp size={12} />) : <IconArrowsSort size={12} opacity={0.4} />}
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
              placeholder={`Buscar ${NIVEL_PLURAL[nivelFilhos].toLowerCase()}…`}
              leftSection={<IconSearch size={14} />}
              value={filtros.busca}
              onChange={(e) => set({ busca: e.currentTarget.value })}
              style={{ flex: 1, minWidth: 160 }}
            />
            <Button
              size="xs"
              variant={ativos ? "light" : "default"}
              leftSection={<IconFilter size={14} />}
              rightSection={ativos ? <Badge size="xs" circle>{ativos}</Badge> : undefined}
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
                <ActionIcon variant="subtle" size="md" onClick={() => set(FILTROS_PADRAO)} aria-label="Limpar filtros">
                  <IconFilterOff size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          <Collapse in={filtrosAbertos}>
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm" p="xs" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 10 }}>
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
              <MultiSelect size="xs" label="Região" data={REGIOES} value={filtros.regioes} onChange={(v) => set({ regioes: v })} clearable />
              <Select
                size="xs"
                label="Vencedor"
                data={(q.data.candidatos ?? []).map((c) => ({ value: c.sqcand, label: `${c.nome_urna} (${c.vitorias})` }))}
                value={filtros.vencedor}
                onChange={(v) => set({ vencedor: v })}
                clearable
                searchable
              />
              <Stack gap={2}>
                <Text size="xs" fw={500}>Capital / interior</Text>
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
                <RangeSlider size="sm" min={0} max={100} step={5} value={filtros.apurado} onChange={(v) => set({ apurado: v })} label={(v) => `${v}%`} />
              </Stack>
              <Stack gap={2}>
                <Text size="xs" fw={500}>
                  Margem: {filtros.margem[0]}–{filtros.margem[1]} p.p.
                </Text>
                <RangeSlider size="sm" min={0} max={100} step={1} value={filtros.margem} onChange={(v) => set({ margem: v })} label={(v) => `${v} p.p.`} />
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
        {fmtInt(filtrados.length)} de {fmtInt(q.data.itens.length)} {NIVEL_PLURAL[nivelFilhos].toLowerCase()}
      </Text>

      <ScrollArea.Autosize mah={alturaMax ?? 560} type="auto" className="scroll-fino">
        <Table highlightOnHover verticalSpacing={6} horizontalSpacing="xs" stickyHeader miw={colunas.length * 95}>
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
              : visiveis.map((it) => <Linha key={it.id} it={it} colunas={colunas} corCand={corCand} onClick={clicar(it)} />)}
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
  g: { chave: string; itens: ItemFilho[]; eleitorado: number; pct: number; validos: number; vitorias: { nome: string; cor: string; n: number }[] };
  aberto: boolean;
  onToggle: () => void;
  colunas: ColunaId[];
  corCand: ReturnType<typeof useCorCandidato>;
  clicar: (it: ItemFilho) => (() => void) | undefined;
}) {
  const [limite, setLimite] = useState(100);
  return (
    <>
      <Table.Tr onClick={onToggle} style={{ cursor: "pointer", background: "var(--mantine-color-default-hover)" }}>
        <Table.Td colSpan={colunas.length}>
          <Group gap="sm" wrap="wrap">
            {aberto ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <Text fw={700} size="sm">
              {g.chave}
            </Text>
            <Text size="xs" c="dimmed">
              {fmtInt(g.itens.length)} itens · {fmtCompact(g.eleitorado)} eleitores · {fmtPct(g.pct, 1)} apurado · {fmtCompact(g.validos)} válidos
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
        g.itens.slice(0, limite).map((it) => <Linha key={it.id} it={it} colunas={colunas} corCand={corCand} onClick={clicar(it)} />)}
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
