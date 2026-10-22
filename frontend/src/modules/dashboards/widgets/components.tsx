import { Badge, Box, Group, ScrollArea, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconArrowDownRight, IconArrowUpRight, IconMinus } from "@tabler/icons-react";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useChildren, useResults } from "../../results";
import type { ResultsWithDataDto } from "../../../api/models";
import { useEffectiveFilter, FilterProvider } from "../../../lib/effective-filter";
import { dayjs } from "../../../lib/time";
import { fmtInt, fmtPP, fmtPct } from "../../../lib/formatting";
import { useCandidateColor } from "../../../lib/useColor";
import { topic } from "../../realtime";
import { useLive } from "../../realtime";
import { TotalsBlock } from "../../results";
import { Scoreboard } from "../../results";
import { WithResults } from "../../results";
import { CandidateCard } from "../../results";
import { Hemicycle } from "../../charts";
import { Donut } from "../../charts";
import { Evolution } from "../../charts";
import { ProgressHeatmap } from "../../charts";
import { EChart, useChartColors } from "../../charts";
import { ElectoralMap, type MapType } from "../../maps";
import { GeoAreaTable, type ColumnId } from "../../results";
import { EventFeed } from "../../events";
import { PollingPlaceDetail } from "../../polling-places";
import { SectionDetail } from "../../sections";
import { Clock } from "../components/Clock";
import { Markdown } from "../components/Markdown";
import { Num } from "../../../components/Num";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { readGeoArea } from "../../results";
import { CandidateAvatar } from "../../results";
import {
  configArray,
  configBool,
  configNumber,
  configString,
  configStringOrNull,
  type WidgetProps,
} from "./types";

const ScrollCorpo = ({ altura, children }: { altura: number; children: React.ReactNode }) => (
  <ScrollArea h={altura} type="auto" className="scroll-fino" offsetScrollbars>
    {children}
  </ScrollArea>
);

// 1 ─ Placar
export function ScoreboardWidget({ cfg, altura, selecionar }: WidgetProps) {
  return (
    <ScrollCorpo altura={altura}>
      <WithResults onUf={(uf, nome) => selecionar("state", uf, nome)}>
        {(res) => (
          <Scoreboard
            res={res}
            opcoes={{
              topN: configNumber(cfg, "topN", 0),
              soEleitos: configBool(cfg, "soEleitos", false),
              mostrarFotos: configBool(cfg, "mostrarFotos", true),
            }}
          />
        )}
      </WithResults>
    </ScrollCorpo>
  );
}

// 2 ─ Bloco de totais
export function TotalsWidget({ cfg, altura, selecionar }: WidgetProps) {
  return (
    <ScrollCorpo altura={altura}>
      <WithResults onUf={(uf, nome) => selecionar("state", uf, nome)}>
        {(res) => <TotalsBlock res={res} compacto={configBool(cfg, "compacto", false) || altura < 200} />}
      </WithResults>
    </ScrollCorpo>
  );
}

// 3 ─ KPI
const KPI_METRICS: Record<
  string,
  { rotulo: string; tipo: "int" | "pct"; get: (r: ResultsWithDataDto, sq: string | null) => number | null }
> = {
  votos_validos: { rotulo: "Votos válidos", tipo: "int", get: (r) => r.totals.valid_votes },
  pct_secoes: { rotulo: "Seções apuradas", tipo: "pct", get: (r) => r.totals.pct_sections },
  comparecimento: { rotulo: "Comparecimento", tipo: "int", get: (r) => r.totals.turnout },
  pct_comparecimento: { rotulo: "% comparecimento", tipo: "pct", get: (r) => r.totals.pct_turnout },
  pct_abstencao: { rotulo: "% abstenção", tipo: "pct", get: (r) => r.totals.pct_abstention },
  brancos: { rotulo: "Votos brancos", tipo: "int", get: (r) => r.totals.blank_votes },
  nulos: { rotulo: "Votos nulos", tipo: "int", get: (r) => r.totals.null_votes },
  margem_pp: { rotulo: "Margem 1º × 2º (p.p.)", tipo: "pct", get: (r) => r.leader?.margin_pp ?? null },
  candidato_pct: {
    rotulo: "% do candidato",
    tipo: "pct",
    get: (r, sq) =>
      r.candidates.find((c) => c.tse_candidate_id === sq)?.valid_pct ?? r.candidates[0]?.valid_pct ?? null,
  },
  candidato_votos: {
    rotulo: "Votos do candidato",
    tipo: "int",
    get: (r, sq) =>
      r.candidates.find((c) => c.tse_candidate_id === sq)?.votes ?? r.candidates[0]?.votes ?? null,
  },
};
export const KPI_OPTIONS = Object.entries(KPI_METRICS).map(([value, m]) => ({ value, label: m.rotulo }));

export function KpiWidget({ cfg }: WidgetProps) {
  const f = useEffectiveFilter();
  const metrica = KPI_METRICS[configString(cfg, "metrica", "votos_validos")] ?? KPI_METRICS.valid_votes;
  const sq = configStringOrNull(cfg, "sqcand");
  const minutos = configNumber(cfg, "compararMin", 15);
  const ref = useMemo(
    () =>
      dayjs(f.t ?? undefined)
        .subtract(minutos, "minute")
        .startOf("minute")
        .toISOString(),
    // recalcula a cada minuto no modo ao vivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.t, minutos, f.t ? 0 : Math.floor(Date.now() / 60_000)],
  );
  const anterior = useResults({ ...f, t: ref }, minutos > 0);
  const corDestaque = configString(cfg, "corDestaque", "");
  return (
    <WithResults linhasSkeleton={1}>
      {(res) => {
        const v = metrica.get(res, sq);
        const a = anterior.data && !anterior.data.no_data ? metrica.get(anterior.data, sq) : null;
        const delta = v !== null && a !== null ? v - a : null;
        const cand = metrica.rotulo.includes("candidato")
          ? (res.candidates.find((c) => c.tse_candidate_id === sq) ?? res.candidates[0])
          : null;
        return (
          <Stack gap={4} justify="center" h="100%" px="xs">
            <Group gap={6}>
              {cand && (
                <CandidateAvatar
                  fotoUrl={cand.photo_url}
                  nome={cand.ballot_name}
                  cor={cand.color}
                  size={26}
                />
              )}
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                {cand ? `${cand.ballot_name} · ` : ""}
                {metrica.rotulo}
              </Text>
            </Group>
            <Num
              valor={v}
              tipo={metrica.tipo}
              style={{
                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                fontWeight: 800,
                lineHeight: 1.05,
                color: corDestaque || undefined,
              }}
            />
            {minutos > 0 && (
              <Group gap={4}>
                {delta === null ? (
                  <Text size="xs" c="dimmed">
                    sem comparação há {minutos} min
                  </Text>
                ) : (
                  <Badge
                    variant="light"
                    color={delta > 0 ? "teal" : delta < 0 ? "red" : "gray"}
                    leftSection={
                      delta > 0 ? (
                        <IconArrowUpRight size={12} />
                      ) : delta < 0 ? (
                        <IconArrowDownRight size={12} />
                      ) : (
                        <IconMinus size={12} />
                      )
                    }
                  >
                    {metrica.tipo === "pct" ? fmtPP(delta) : fmtInt(delta)} em {minutos} min
                  </Badge>
                )}
              </Group>
            )}
          </Stack>
        );
      }}
    </WithResults>
  );
}

// 4 ─ Mapa
export function MapWidget({ cfg, altura, selecionar, widget }: WidgetProps) {
  const f = useEffectiveFilter();
  const basemap = configString(cfg, "basemap", "padrao");
  return (
    <Box h={altura} style={{ borderRadius: 10, overflow: "hidden" }} key={widget.id}>
      <ElectoralMap
        tipo={configString(cfg, "tipo", "vencedores") as MapType}
        nivel={f.nivel}
        id={f.id}
        todosMunicipios={configString(cfg, "nivelFilhos", "auto") === "municipio"}
        candidatoA={configStringOrNull(cfg, "candidatoA")}
        candidatoB={configStringOrNull(cfg, "candidatoB")}
        basemap={basemap === "padrao" ? undefined : basemap === "sim"}
        onSelecionar={selecionar}
        altura={altura}
      />
    </Box>
  );
}

// 5 ─ Evolução
export function EvolutionWidget({ cfg, altura }: WidgetProps) {
  return (
    <Evolution
      eixoX={configString(cfg, "eixoX", "t") as "t" | "pct_secoes"}
      metrica={configString(cfg, "metrica", "pct") as "pct" | "votos" | "diferenca"}
      estilo={configString(cfg, "estilo", "linha") as "linha" | "area"}
      topN={configNumber(cfg, "topN", 6)}
      altura={altura}
    />
  );
}

// 6 ─ Tabela de recortes
export function TableWidget({ cfg, altura, selecionar }: WidgetProps) {
  const f = useEffectiveFilter();
  const nf = configString(cfg, "nivelFilhos", "auto");
  const colunas = configArray(cfg, "colunas") as ColumnId[];
  return (
    <ScrollCorpo altura={altura}>
      <GeoAreaTable
        nivel={f.nivel}
        id={f.id}
        filhos={nf === "municipio" && f.nivel === "country" ? "municipality" : null}
        colunas={colunas.length ? colunas : undefined}
        topN={configNumber(cfg, "topN", 0) || undefined}
        mostrarFiltros={configBool(cfg, "mostrarFiltros", true)}
        onSelecionar={selecionar}
        alturaMax={Math.max(160, altura - 110)}
        porPagina={25}
      />
    </ScrollCorpo>
  );
}

// 7 ─ Comparativo lado a lado
function ColunaComparativa({ nivel, id }: { nivel: string; id: string }) {
  const corCand = useCandidateColor();
  return (
    <FilterProvider value={{ nivel: nivel as never, id }}>
      <Stack
        gap={6}
        p="xs"
        style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 10, minWidth: 0 }}
      >
        <WithResults linhasSkeleton={3}>
          {(res) => (
            <Stack gap={6}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={700} size="sm" lineClamp={1}>
                  {res.geo_area.name}
                </Text>
                <Badge size="xs" variant="light">
                  {fmtPct(res.totals.pct_sections, 1)}
                </Badge>
              </Group>
              {[...res.candidates]
                .sort((a, b) => b.votes - a.votes)
                .slice(0, 4)
                .map((c) => {
                  const cor = corCand(c.tse_candidate_id, c.color, c.ballot_number);
                  return (
                    <Stack key={c.tse_candidate_id} gap={2}>
                      <Group justify="space-between" wrap="nowrap" gap={4}>
                        <Text size="xs" fw={600} lineClamp={1}>
                          {c.ballot_name}
                        </Text>
                        <Num valor={c.valid_pct} tipo="pct" style={{ fontSize: 12, fontWeight: 700 }} />
                      </Group>
                      <Box className="barra-trilho" style={{ height: 6 }}>
                        <Box
                          className="barra-preenchida"
                          style={{ width: `${c.valid_pct}%`, background: cor }}
                        />
                      </Box>
                    </Stack>
                  );
                })}
              <Text size="xs" c="dimmed">
                Válidos: <span className="num">{fmtInt(res.totals.valid_votes)}</span>
              </Text>
            </Stack>
          )}
        </WithResults>
      </Stack>
    </FilterProvider>
  );
}

function ComparativoCandidatos({ candidatos, altura }: { candidatos: string[]; altura: number }) {
  const f = useEffectiveFilter();
  const base = useChildren({ turno: f.turno, cargo: f.cargo, nivel: f.nivel, id: f.id, t: f.t });
  const sel = candidatos.length
    ? candidatos
    : (base.data?.candidates ?? []).slice(0, 2).map((c) => c.tse_candidate_id);
  const q = useChildren(
    { turno: f.turno, cargo: f.cargo, nivel: f.nivel, id: f.id, t: f.t, candidatos: sel },
    sel.length > 0,
  );
  useLive([topic.children(f.turno, f.cargo, f.nivel, f.id)]);
  const corCand = useCandidateColor();
  const c = useChartColors();
  const dados = q.data;
  const chaveSel = sel.join(",");
  const option = useMemo<EChartsOption | null>(() => {
    if (!dados) return null;
    const itens = [...dados.items]
      .sort((a, b) => b.electorate - a.electorate)
      .slice(0, 14)
      .reverse();
    const cands = chaveSel
      .split(",")
      .map((s) => dados.candidates.find((x) => x.tse_candidate_id === s))
      .filter((x): x is NonNullable<typeof x> => !!x);
    return {
      grid: { left: 4, right: 18, top: 28, bottom: 4, containLabel: true },
      legend: { top: 0, textStyle: { color: c.texto, fontSize: 11 } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmtPct(Number(v)) },
      xAxis: {
        type: "value",
        axisLabel: { color: c.textoFraco, formatter: "{value}%" },
        splitLine: { lineStyle: { color: c.linha } },
      },
      yAxis: {
        type: "category",
        data: itens.map((i) => i.name),
        axisLabel: { color: c.texto, fontSize: 11, width: 110, overflow: "truncate" },
      },
      series: cands.map((cd) => ({
        type: "bar",
        name: cd.ballot_name,
        itemStyle: {
          color: corCand(cd.tse_candidate_id, cd.color, cd.ballot_number),
          borderRadius: [0, 4, 4, 0],
        },
        barMaxWidth: 12,
        data: itens.map((i) => i.values?.[cd.tse_candidate_id] ?? 0),
      })),
    } as EChartsOption;
  }, [dados, chaveSel, corCand, c]);
  if (q.isLoading || base.isLoading) return <Loading altura={altura} />;
  if (q.error) return <ErrorView erro={q.error} onRetry={() => q.refetch()} />;
  if (!option) return <NoData />;
  return <EChart option={option} height={altura} />;
}

export function ComparisonWidget({ cfg, altura }: WidgetProps) {
  const modo = configString(cfg, "modo", "recortes");
  if (modo === "candidatos")
    return <ComparativoCandidatos candidatos={configArray(cfg, "candidatos").slice(0, 4)} altura={altura} />;
  const recortes = configArray(cfg, "recortes").map(readGeoArea).filter(Boolean).slice(0, 4) as {
    nivel: string;
    id: string;
  }[];
  const lista = recortes.length
    ? recortes
    : [
        { nivel: "state", id: "sp" },
        { nivel: "state", id: "mg" },
        { nivel: "state", id: "rj" },
      ];
  return (
    <ScrollCorpo altura={altura}>
      <SimpleGrid cols={{ base: 1, xs: Math.min(2, lista.length), md: lista.length }} spacing="xs">
        {lista.map((r) => (
          <ColunaComparativa key={`${r.nivel}:${r.id}`} nivel={r.nivel} id={r.id} />
        ))}
      </SimpleGrid>
    </ScrollCorpo>
  );
}

// 8 ─ Hemiciclo
export function HemicycleWidget({ altura, selecionar }: WidgetProps) {
  return (
    <WithResults onUf={(uf, nome) => selecionar("state", uf, nome)}>
      {(res) =>
        res.office.voting_system !== "proporcional" || !res.alliances.length ? (
          <NoData titulo="Hemiciclo indisponível">
            O hemiciclo de vagas é exibido para cargos proporcionais (deputados), depois que o TSE publica a
            distribuição de vagas.
          </NoData>
        ) : (
          <Stack gap={4}>
            <Hemicycle agremiacoes={res.alliances} height={Math.max(160, altura - 50)} />
            <Group gap={6} justify="center">
              {[...res.alliances]
                .filter((a) => (a.seats ?? 0) > 0)
                .sort((a, b) => (b.seats ?? 0) - (a.seats ?? 0))
                .slice(0, 10)
                .map((a) => (
                  <Badge key={a.name} variant="dot" color={a.color} size="sm">
                    {a.name} {a.seats}
                  </Badge>
                ))}
            </Group>
          </Stack>
        )
      }
    </WithResults>
  );
}

// 9 ─ Rosca
export function DonutWidget({ cfg, altura, selecionar }: WidgetProps) {
  return (
    <WithResults onUf={(uf, nome) => selecionar("state", uf, nome)}>
      {(res) => (
        <Donut
          res={res}
          topN={configNumber(cfg, "topN", 6)}
          incluirBrancosNulos={configBool(cfg, "incluirBrancosNulos", false)}
          altura={altura}
        />
      )}
    </WithResults>
  );
}

// 10 ─ Heatmap de progresso
export function HeatmapWidget({ cfg, altura, selecionar }: WidgetProps) {
  return (
    <ScrollCorpo altura={altura}>
      <ProgressHeatmap
        metrica={configString(cfg, "metrica", "pct_secoes") as "pct_secoes" | "pct_comparecimento"}
        onSelecionarUf={(uf, nome) => selecionar("state", uf, nome)}
      />
    </ScrollCorpo>
  );
}

// 11 ─ Feed de eventos
export function EventsWidget({ cfg, altura }: WidgetProps) {
  const f = useEffectiveFilter();
  const soRecorte = configBool(cfg, "soRecorte", false);
  return (
    <EventFeed
      tipos={configArray(cfg, "tipos")}
      limite={configNumber(cfg, "limite", 50)}
      cargo={configBool(cfg, "soCargo", false) ? f.cargo : null}
      nivel={soRecorte ? f.nivel : null}
      id={soRecorte ? f.id : null}
      compacto={altura < 220}
      alturaMax={altura}
    />
  );
}

// 12 ─ Card de candidato
export function CandidateWidget({ cfg, altura }: WidgetProps) {
  return (
    <ScrollCorpo altura={altura}>
      <CandidateCard sqcand={configStringOrNull(cfg, "sqcand")} />
    </ScrollCorpo>
  );
}

// 13 ─ Local de votação
export function PollingPlaceWidget({ cfg, altura }: WidgetProps) {
  const f = useEffectiveFilter();
  const id = configStringOrNull(cfg, "localId") ?? (f.nivel === "polling_place" ? f.id : null);
  return (
    <ScrollCorpo altura={altura}>
      <PollingPlaceDetail localId={id} alturaLista={Math.max(160, altura - 120)} />
    </ScrollCorpo>
  );
}

// 14 ─ Seção
export function SectionWidget({ cfg, altura }: WidgetProps) {
  const f = useEffectiveFilter();
  const id = configStringOrNull(cfg, "secaoId") ?? (f.nivel === "section" ? f.id : null);
  return (
    <ScrollCorpo altura={altura}>
      <SectionDetail secaoId={id} compacto />
    </ScrollCorpo>
  );
}

// 15 ─ Relógio / contagem regressiva
export function ClockWidget({ cfg }: WidgetProps) {
  return (
    <Clock
      modo={configString(cfg, "modo", "relogio") as "relogio" | "contagem"}
      alvo={configStringOrNull(cfg, "alvo")}
      rotulo={configString(cfg, "rotulo", "")}
    />
  );
}

// 16 ─ Texto/anotação
export function TextWidget({ cfg, altura }: WidgetProps) {
  const texto = configString(cfg, "texto", "");
  return (
    <ScrollCorpo altura={altura}>
      {texto ? (
        <Markdown texto={texto} />
      ) : (
        <Text size="sm" c="dimmed">
          Edite o widget para escrever uma anotação (aceita **negrito**, *itálico*, listas e links).
        </Text>
      )}
    </ScrollCorpo>
  );
}
