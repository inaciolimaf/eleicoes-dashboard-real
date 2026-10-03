import { Badge, Box, Group, ScrollArea, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconArrowDownRight, IconArrowUpRight, IconMinus } from "@tabler/icons-react";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useFilhos, useResultados } from "../api/hooks";
import type { ResultadosComDados } from "../api/types";
import { useFiltroEfetivo, FiltroProvider } from "../lib/filtro-efetivo";
import { dayjs } from "../lib/time";
import { fmtInt, fmtPP, fmtPct } from "../lib/format";
import { useCorCandidato } from "../lib/useCor";
import { topico } from "../realtime/topicos";
import { useLive } from "../realtime/useLive";
import { BlocoTotais } from "../components/resultados/BlocoTotais";
import { Placar } from "../components/resultados/Placar";
import { ComResultados } from "../components/resultados/ComResultados";
import { CardCandidato } from "../components/resultados/CardCandidato";
import { Hemiciclo } from "../components/graficos/Hemiciclo";
import { Rosca } from "../components/graficos/Rosca";
import { Evolucao } from "../components/graficos/Evolucao";
import { HeatmapProgresso } from "../components/graficos/HeatmapProgresso";
import { EChart, useCoresGrafico } from "../components/graficos/EChart";
import { MapaEleitoral, type TipoMapa } from "../components/mapas";
import { TabelaRecortes, type ColunaId } from "../components/tabelas/TabelaRecortes";
import { FeedEventos } from "../components/eventos/FeedEventos";
import { DetalheLocal } from "../components/locais/DetalheLocal";
import { DetalheSecao } from "../components/secoes/DetalheSecao";
import { Relogio } from "../components/common/Relogio";
import { Markdown } from "../components/common/Markdown";
import { Num } from "../components/common/Num";
import { Carregando, ErroView, SemDados } from "../components/common/Estados";
import { lerRecorte } from "../components/common/Pickers";
import { AvatarCandidato } from "../components/resultados/AvatarCandidato";
import { cfgArr, cfgBool, cfgNum, cfgStr, cfgStrOuNull, type WidgetProps } from "./tipos";

const ScrollCorpo = ({ altura, children }: { altura: number; children: React.ReactNode }) => (
  <ScrollArea h={altura} type="auto" className="scroll-fino" offsetScrollbars>
    {children}
  </ScrollArea>
);

// 1 ─ Placar
export function WPlacar({ cfg, altura, selecionar }: WidgetProps) {
  return (
    <ScrollCorpo altura={altura}>
      <ComResultados onUf={(uf, nome) => selecionar("uf", uf, nome)}>
        {(res) => (
          <Placar
            res={res}
            opcoes={{ topN: cfgNum(cfg, "topN", 0), soEleitos: cfgBool(cfg, "soEleitos", false), mostrarFotos: cfgBool(cfg, "mostrarFotos", true) }}
          />
        )}
      </ComResultados>
    </ScrollCorpo>
  );
}

// 2 ─ Bloco de totais
export function WTotais({ cfg, altura, selecionar }: WidgetProps) {
  return (
    <ScrollCorpo altura={altura}>
      <ComResultados onUf={(uf, nome) => selecionar("uf", uf, nome)}>
        {(res) => <BlocoTotais res={res} compacto={cfgBool(cfg, "compacto", false) || altura < 200} />}
      </ComResultados>
    </ScrollCorpo>
  );
}

// 3 ─ KPI
const METRICAS_KPI: Record<string, { rotulo: string; tipo: "int" | "pct"; get: (r: ResultadosComDados, sq: string | null) => number | null }> = {
  votos_validos: { rotulo: "Votos válidos", tipo: "int", get: (r) => r.totais.votos_validos },
  pct_secoes: { rotulo: "Seções apuradas", tipo: "pct", get: (r) => r.totais.pct_secoes },
  comparecimento: { rotulo: "Comparecimento", tipo: "int", get: (r) => r.totais.comparecimento },
  pct_comparecimento: { rotulo: "% comparecimento", tipo: "pct", get: (r) => r.totais.pct_comparecimento },
  pct_abstencao: { rotulo: "% abstenção", tipo: "pct", get: (r) => r.totais.pct_abstencao },
  brancos: { rotulo: "Votos brancos", tipo: "int", get: (r) => r.totais.brancos },
  nulos: { rotulo: "Votos nulos", tipo: "int", get: (r) => r.totais.nulos },
  margem_pp: { rotulo: "Margem 1º × 2º (p.p.)", tipo: "pct", get: (r) => r.lider?.margem_pp ?? null },
  candidato_pct: { rotulo: "% do candidato", tipo: "pct", get: (r, sq) => r.candidatos.find((c) => c.sqcand === sq)?.pct_validos ?? r.candidatos[0]?.pct_validos ?? null },
  candidato_votos: { rotulo: "Votos do candidato", tipo: "int", get: (r, sq) => r.candidatos.find((c) => c.sqcand === sq)?.votos ?? r.candidatos[0]?.votos ?? null },
};
export const OPCOES_KPI = Object.entries(METRICAS_KPI).map(([value, m]) => ({ value, label: m.rotulo }));

export function WKpi({ cfg }: WidgetProps) {
  const f = useFiltroEfetivo();
  const metrica = METRICAS_KPI[cfgStr(cfg, "metrica", "votos_validos")] ?? METRICAS_KPI.votos_validos;
  const sq = cfgStrOuNull(cfg, "sqcand");
  const minutos = cfgNum(cfg, "compararMin", 15);
  const ref = useMemo(
    () => dayjs(f.t ?? undefined).subtract(minutos, "minute").startOf("minute").toISOString(),
    // recalcula a cada minuto no modo ao vivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.t, minutos, f.t ? 0 : Math.floor(Date.now() / 60_000)],
  );
  const anterior = useResultados({ ...f, t: ref }, minutos > 0);
  const corDestaque = cfgStr(cfg, "corDestaque", "");
  return (
    <ComResultados linhasSkeleton={1}>
      {(res) => {
        const v = metrica.get(res, sq);
        const a = anterior.data && !anterior.data.sem_dados ? metrica.get(anterior.data, sq) : null;
        const delta = v !== null && a !== null ? v - a : null;
        const cand = metrica.rotulo.includes("candidato") ? res.candidatos.find((c) => c.sqcand === sq) ?? res.candidatos[0] : null;
        return (
          <Stack gap={4} justify="center" h="100%" px="xs">
            <Group gap={6}>
              {cand && <AvatarCandidato fotoUrl={cand.foto_url} nome={cand.nome_urna} cor={cand.cor} size={26} />}
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                {cand ? `${cand.nome_urna} · ` : ""}
                {metrica.rotulo}
              </Text>
            </Group>
            <Num valor={v} tipo={metrica.tipo} style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 800, lineHeight: 1.05, color: corDestaque || undefined }} />
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
                    leftSection={delta > 0 ? <IconArrowUpRight size={12} /> : delta < 0 ? <IconArrowDownRight size={12} /> : <IconMinus size={12} />}
                  >
                    {metrica.tipo === "pct" ? fmtPP(delta) : fmtInt(delta)} em {minutos} min
                  </Badge>
                )}
              </Group>
            )}
          </Stack>
        );
      }}
    </ComResultados>
  );
}

// 4 ─ Mapa
export function WMapa({ cfg, altura, selecionar, widget }: WidgetProps) {
  const f = useFiltroEfetivo();
  const basemap = cfgStr(cfg, "basemap", "padrao");
  return (
    <Box h={altura} style={{ borderRadius: 10, overflow: "hidden" }} key={widget.id}>
      <MapaEleitoral
        tipo={cfgStr(cfg, "tipo", "vencedores") as TipoMapa}
        nivel={f.nivel}
        id={f.id}
        todosMunicipios={cfgStr(cfg, "nivelFilhos", "auto") === "municipio"}
        candidatoA={cfgStrOuNull(cfg, "candidatoA")}
        candidatoB={cfgStrOuNull(cfg, "candidatoB")}
        basemap={basemap === "padrao" ? undefined : basemap === "sim"}
        onSelecionar={selecionar}
        altura={altura}
      />
    </Box>
  );
}

// 5 ─ Evolução
export function WEvolucao({ cfg, altura }: WidgetProps) {
  return (
    <Evolucao
      eixoX={cfgStr(cfg, "eixoX", "t") as "t" | "pct_secoes"}
      metrica={cfgStr(cfg, "metrica", "pct") as "pct" | "votos" | "diferenca"}
      estilo={cfgStr(cfg, "estilo", "linha") as "linha" | "area"}
      topN={cfgNum(cfg, "topN", 6)}
      altura={altura}
    />
  );
}

// 6 ─ Tabela de recortes
export function WTabela({ cfg, altura, selecionar }: WidgetProps) {
  const f = useFiltroEfetivo();
  const nf = cfgStr(cfg, "nivelFilhos", "auto");
  const colunas = cfgArr(cfg, "colunas") as ColunaId[];
  return (
    <ScrollCorpo altura={altura}>
      <TabelaRecortes
        nivel={f.nivel}
        id={f.id}
        filhos={nf === "municipio" && f.nivel === "br" ? "municipio" : null}
        colunas={colunas.length ? colunas : undefined}
        topN={cfgNum(cfg, "topN", 0) || undefined}
        mostrarFiltros={cfgBool(cfg, "mostrarFiltros", true)}
        onSelecionar={selecionar}
        alturaMax={Math.max(160, altura - 110)}
        porPagina={25}
      />
    </ScrollCorpo>
  );
}

// 7 ─ Comparativo lado a lado
function ColunaComparativa({ nivel, id }: { nivel: string; id: string }) {
  const corCand = useCorCandidato();
  return (
    <FiltroProvider value={{ nivel: nivel as never, id }}>
      <Stack gap={6} p="xs" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 10, minWidth: 0 }}>
        <ComResultados linhasSkeleton={3}>
          {(res) => (
            <Stack gap={6}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={700} size="sm" lineClamp={1}>
                  {res.recorte.nome}
                </Text>
                <Badge size="xs" variant="light">
                  {fmtPct(res.totais.pct_secoes, 1)}
                </Badge>
              </Group>
              {[...res.candidatos]
                .sort((a, b) => b.votos - a.votos)
                .slice(0, 4)
                .map((c) => {
                  const cor = corCand(c.sqcand, c.cor, c.numero);
                  return (
                    <Stack key={c.sqcand} gap={2}>
                      <Group justify="space-between" wrap="nowrap" gap={4}>
                        <Text size="xs" fw={600} lineClamp={1}>
                          {c.nome_urna}
                        </Text>
                        <Num valor={c.pct_validos} tipo="pct" style={{ fontSize: 12, fontWeight: 700 }} />
                      </Group>
                      <Box className="barra-trilho" style={{ height: 6 }}>
                        <Box className="barra-preenchida" style={{ width: `${c.pct_validos}%`, background: cor }} />
                      </Box>
                    </Stack>
                  );
                })}
              <Text size="xs" c="dimmed">
                Válidos: <span className="num">{fmtInt(res.totais.votos_validos)}</span>
              </Text>
            </Stack>
          )}
        </ComResultados>
      </Stack>
    </FiltroProvider>
  );
}

function ComparativoCandidatos({ candidatos, altura }: { candidatos: string[]; altura: number }) {
  const f = useFiltroEfetivo();
  const base = useFilhos({ turno: f.turno, cargo: f.cargo, nivel: f.nivel, id: f.id, t: f.t });
  const sel = candidatos.length ? candidatos : (base.data?.candidatos ?? []).slice(0, 2).map((c) => c.sqcand);
  const q = useFilhos({ turno: f.turno, cargo: f.cargo, nivel: f.nivel, id: f.id, t: f.t, candidatos: sel }, sel.length > 0);
  useLive([topico.filhos(f.turno, f.cargo, f.nivel, f.id)]);
  const corCand = useCorCandidato();
  const c = useCoresGrafico();
  const dados = q.data;
  const chaveSel = sel.join(",");
  const option = useMemo<EChartsOption | null>(() => {
    if (!dados) return null;
    const itens = [...dados.itens].sort((a, b) => b.eleitorado - a.eleitorado).slice(0, 14).reverse();
    const cands = chaveSel
      .split(",")
      .map((s) => dados.candidatos.find((x) => x.sqcand === s))
      .filter((x): x is NonNullable<typeof x> => !!x);
    return {
      grid: { left: 4, right: 18, top: 28, bottom: 4, containLabel: true },
      legend: { top: 0, textStyle: { color: c.texto, fontSize: 11 } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmtPct(Number(v)) },
      xAxis: { type: "value", axisLabel: { color: c.textoFraco, formatter: "{value}%" }, splitLine: { lineStyle: { color: c.linha } } },
      yAxis: { type: "category", data: itens.map((i) => i.nome), axisLabel: { color: c.texto, fontSize: 11, width: 110, overflow: "truncate" } },
      series: cands.map((cd) => ({
        type: "bar",
        name: cd.nome_urna,
        itemStyle: { color: corCand(cd.sqcand, cd.cor, cd.numero), borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 12,
        data: itens.map((i) => i.valores?.[cd.sqcand] ?? 0),
      })),
    } as EChartsOption;
  }, [dados, chaveSel, corCand, c]);
  if (q.isLoading || base.isLoading) return <Carregando altura={altura} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  if (!option) return <SemDados />;
  return <EChart option={option} height={altura} />;
}

export function WComparativo({ cfg, altura }: WidgetProps) {
  const modo = cfgStr(cfg, "modo", "recortes");
  if (modo === "candidatos") return <ComparativoCandidatos candidatos={cfgArr(cfg, "candidatos").slice(0, 4)} altura={altura} />;
  const recortes = cfgArr(cfg, "recortes").map(lerRecorte).filter(Boolean).slice(0, 4) as { nivel: string; id: string }[];
  const lista = recortes.length ? recortes : [{ nivel: "uf", id: "sp" }, { nivel: "uf", id: "mg" }, { nivel: "uf", id: "rj" }];
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
export function WHemiciclo({ altura, selecionar }: WidgetProps) {
  return (
    <ComResultados onUf={(uf, nome) => selecionar("uf", uf, nome)}>
      {(res) =>
        res.cargo.sistema !== "proporcional" || !res.agremiacoes.length ? (
          <SemDados titulo="Hemiciclo indisponível">
            O hemiciclo de vagas é exibido para cargos proporcionais (deputados), depois que o TSE publica a distribuição de vagas.
          </SemDados>
        ) : (
          <Stack gap={4}>
            <Hemiciclo agremiacoes={res.agremiacoes} height={Math.max(160, altura - 50)} />
            <Group gap={6} justify="center">
              {[...res.agremiacoes]
                .filter((a) => a.vagas > 0)
                .sort((a, b) => b.vagas - a.vagas)
                .slice(0, 10)
                .map((a) => (
                  <Badge key={a.nome} variant="dot" color={a.cor} size="sm">
                    {a.nome} {a.vagas}
                  </Badge>
                ))}
            </Group>
          </Stack>
        )
      }
    </ComResultados>
  );
}

// 9 ─ Rosca
export function WRosca({ cfg, altura, selecionar }: WidgetProps) {
  return (
    <ComResultados onUf={(uf, nome) => selecionar("uf", uf, nome)}>
      {(res) => <Rosca res={res} topN={cfgNum(cfg, "topN", 6)} incluirBrancosNulos={cfgBool(cfg, "incluirBrancosNulos", false)} altura={altura} />}
    </ComResultados>
  );
}

// 10 ─ Heatmap de progresso
export function WHeatmap({ cfg, altura, selecionar }: WidgetProps) {
  return (
    <ScrollCorpo altura={altura}>
      <HeatmapProgresso
        metrica={cfgStr(cfg, "metrica", "pct_secoes") as "pct_secoes" | "pct_comparecimento"}
        onSelecionarUf={(uf, nome) => selecionar("uf", uf, nome)}
      />
    </ScrollCorpo>
  );
}

// 11 ─ Feed de eventos
export function WEventos({ cfg, altura }: WidgetProps) {
  const f = useFiltroEfetivo();
  const soRecorte = cfgBool(cfg, "soRecorte", false);
  return (
    <FeedEventos
      tipos={cfgArr(cfg, "tipos")}
      limite={cfgNum(cfg, "limite", 50)}
      cargo={cfgBool(cfg, "soCargo", false) ? f.cargo : null}
      nivel={soRecorte ? f.nivel : null}
      id={soRecorte ? f.id : null}
      compacto={altura < 220}
      alturaMax={altura}
    />
  );
}

// 12 ─ Card de candidato
export function WCandidato({ cfg, altura }: WidgetProps) {
  return (
    <ScrollCorpo altura={altura}>
      <CardCandidato sqcand={cfgStrOuNull(cfg, "sqcand")} />
    </ScrollCorpo>
  );
}

// 13 ─ Local de votação
export function WLocal({ cfg, altura }: WidgetProps) {
  const f = useFiltroEfetivo();
  const id = cfgStrOuNull(cfg, "localId") ?? (f.nivel === "local" ? f.id : null);
  return (
    <ScrollCorpo altura={altura}>
      <DetalheLocal localId={id} alturaLista={Math.max(160, altura - 120)} />
    </ScrollCorpo>
  );
}

// 14 ─ Seção
export function WSecao({ cfg, altura }: WidgetProps) {
  const f = useFiltroEfetivo();
  const id = cfgStrOuNull(cfg, "secaoId") ?? (f.nivel === "secao" ? f.id : null);
  return (
    <ScrollCorpo altura={altura}>
      <DetalheSecao secaoId={id} compacto />
    </ScrollCorpo>
  );
}

// 15 ─ Relógio / contagem regressiva
export function WRelogio({ cfg }: WidgetProps) {
  return <Relogio modo={cfgStr(cfg, "modo", "relogio") as "relogio" | "contagem"} alvo={cfgStrOuNull(cfg, "alvo")} rotulo={cfgStr(cfg, "rotulo", "")} />;
}

// 16 ─ Texto/anotação
export function WTexto({ cfg, altura }: WidgetProps) {
  const texto = cfgStr(cfg, "texto", "");
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

