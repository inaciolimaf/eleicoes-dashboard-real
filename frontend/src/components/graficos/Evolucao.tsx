import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Nivel } from "../../api/types";
import { useSerie } from "../../api/hooks";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { useCorCandidato } from "../../lib/useCor";
import { brt } from "../../lib/time";
import { fmtInt, fmtNum } from "../../lib/format";
import { Carregando, ErroView, SemDados } from "../common/Estados";
import { EChart, useCoresGrafico } from "./EChart";
import { COR_EVENTO, ROTULO_EVENTO } from "../../realtime/aplicar";

export interface EvolucaoProps {
  nivel?: Nivel;
  id?: string;
  eixoX?: "t" | "pct_secoes";
  metrica?: "pct" | "votos" | "diferenca";
  estilo?: "linha" | "area";
  topN?: number;
  altura?: number | string;
  mostrarEventos?: boolean;
}

const COR_MANTINE: Record<string, string> = {
  orange: "#F97316", blue: "#3D7BFF", green: "#22C55E", yellow: "#EAB308", teal: "#14B8A6", grape: "#A855F7", cyan: "#06B6D4",
};

/** Gráfico de evolução: % de cada candidato × horário ou × % de seções, com marcadores de eventos. */
export function Evolucao({ nivel, id, eixoX = "t", metrica = "pct", estilo = "linha", topN = 6, altura = 300, mostrarEventos = true }: EvolucaoProps) {
  const f = useFiltroEfetivo();
  const q = useSerie({ turno: f.turno, cargo: f.cargo, nivel: nivel ?? f.nivel, id: id ?? f.id, t: f.t });
  const corCand = useCorCandidato();
  const c = useCoresGrafico();

  const option = useMemo<EChartsOption | null>(() => {
    const s = q.data;
    if (!s || !s.pontos.length) return null;
    const ultimo = s.pontos[s.pontos.length - 1];
    const cands = [...s.candidatos]
      .sort((a, b) => (ultimo.candidatos[b.sqcand]?.votos ?? 0) - (ultimo.candidatos[a.sqcand]?.votos ?? 0))
      .slice(0, Math.max(2, topN));
    const x = (p: (typeof s.pontos)[number]) => (eixoX === "t" ? new Date(p.t).getTime() : p.pct_secoes);
    const area = estilo === "area";

    let series: EChartsOption["series"];
    if (metrica === "diferenca" && cands.length >= 2) {
      const [a, b] = cands;
      series = [
        {
          type: "line",
          name: `${a.nome_urna} − ${b.nome_urna}`,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { width: 2.5, color: corCand(a.sqcand, a.cor) },
          itemStyle: { color: corCand(a.sqcand, a.cor) },
          areaStyle: area ? { opacity: 0.15 } : undefined,
          data: s.pontos.map((p) => [x(p), (p.candidatos[a.sqcand]?.pct ?? 0) - (p.candidatos[b.sqcand]?.pct ?? 0)]),
        },
      ];
    } else {
      series = cands.map((cd) => ({
        type: "line" as const,
        name: `${cd.nome_urna} (${cd.numero})`,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { width: 2.5, color: corCand(cd.sqcand, cd.cor, cd.numero) },
        itemStyle: { color: corCand(cd.sqcand, cd.cor, cd.numero) },
        areaStyle: area ? { opacity: 0.12 } : undefined,
        emphasis: { focus: "series" as const },
        data: s.pontos.map((p) => [x(p), metrica === "votos" ? p.candidatos[cd.sqcand]?.votos ?? 0 : p.candidatos[cd.sqcand]?.pct ?? 0]),
      }));
    }

    // marcadores de eventos
    if (mostrarEventos && s.eventos.length && Array.isArray(series) && series.length) {
      const posX = (iso: string) => {
        if (eixoX === "t") return new Date(iso).getTime();
        let v = s.pontos[0].pct_secoes;
        for (const p of s.pontos) if (p.t <= iso) v = p.pct_secoes;
        return v;
      };
      (series[0] as { markLine?: unknown }).markLine = {
        symbol: "none",
        silent: false,
        animation: false,
        label: { show: false },
        lineStyle: { type: "dashed", width: 1, opacity: 0.8 },
        data: s.eventos.map((e) => ({
          xAxis: posX(e.ocorrido_em),
          name: e.titulo,
          lineStyle: { color: COR_MANTINE[COR_EVENTO[e.tipo] ?? "blue"] ?? "#888" },
          tooltip: { formatter: `<b>${ROTULO_EVENTO[e.tipo] ?? e.tipo}</b><br/>${e.titulo}<br/>${brt(e.ocorrido_em).format("HH:mm")}` },
          label: { show: false },
        })),
      };
    }

    const yFmt = (v: number) => (metrica === "votos" ? fmtNum(v / 1_000_000, 1) + " mi" : `${fmtNum(v, 0)}${metrica === "diferenca" ? " p.p." : "%"}`);
    return {
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      legend: { type: "scroll", top: 0, textStyle: { color: c.texto, fontSize: 11 }, icon: "roundRect", itemWidth: 12, itemHeight: 6 },
      tooltip: {
        trigger: "axis",
        valueFormatter: (v) => (metrica === "votos" ? fmtInt(Number(v)) : `${fmtNum(Number(v), 2)}${metrica === "diferenca" ? " p.p." : "%"}`),
        axisPointer: { type: "line" },
      },
      xAxis:
        eixoX === "t"
          ? {
              type: "time",
              axisLabel: { color: c.textoFraco, formatter: (v: number) => brt(v).format("HH:mm"), hideOverlap: true },
              axisLine: { lineStyle: { color: c.linha } },
              splitLine: { show: false },
            }
          : {
              type: "value",
              min: 0,
              max: 100,
              name: "% seções",
              nameLocation: "end",
              nameTextStyle: { color: c.textoFraco, fontSize: 10 },
              axisLabel: { color: c.textoFraco, formatter: "{value}%" },
              axisLine: { lineStyle: { color: c.linha } },
              splitLine: { show: false },
            },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: c.textoFraco, formatter: (v: number) => yFmt(v) },
        splitLine: { lineStyle: { color: c.linha } },
      },
      series,
    } as EChartsOption;
  }, [q.data, eixoX, metrica, estilo, topN, mostrarEventos, corCand, c]);

  if (q.isLoading) return <Carregando altura={altura} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  if (!option) return <SemDados titulo="Sem série histórica ainda">A evolução aparece depois dos primeiros snapshots.</SemDados>;
  return <EChart option={option} height={altura} />;
}
