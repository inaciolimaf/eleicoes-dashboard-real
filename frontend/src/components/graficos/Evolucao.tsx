import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Level } from "../../api/models";
import { useSerie } from "../../api/hooks";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { useCorCandidato } from "../../lib/useCor";
import { brt } from "../../lib/time";
import { fmtInt, fmtNum } from "../../lib/format";
import { Carregando, ErroView, SemDados } from "../common/Estados";
import { EChart, useCoresGrafico } from "./EChart";
import { COR_EVENTO, ROTULO_EVENTO } from "../../lib/eventos";

export interface EvolucaoProps {
  nivel?: Level;
  id?: string;
  eixoX?: "t" | "pct_secoes";
  metrica?: "pct" | "votos" | "diferenca";
  estilo?: "linha" | "area";
  topN?: number;
  altura?: number | string;
  mostrarEventos?: boolean;
}

const COR_MANTINE: Record<string, string> = {
  orange: "#F97316",
  blue: "#3D7BFF",
  green: "#22C55E",
  yellow: "#EAB308",
  teal: "#14B8A6",
  grape: "#A855F7",
  cyan: "#06B6D4",
};

/** Gráfico de evolução: % de cada candidato × horário ou × % de seções, com marcadores de eventos. */
export function Evolucao({
  nivel,
  id,
  eixoX = "t",
  metrica = "pct",
  estilo = "linha",
  topN = 6,
  altura = 300,
  mostrarEventos = true,
}: EvolucaoProps) {
  const f = useFiltroEfetivo();
  const q = useSerie({ turno: f.turno, cargo: f.cargo, nivel: nivel ?? f.nivel, id: id ?? f.id, t: f.t });
  const corCand = useCorCandidato();
  const c = useCoresGrafico();

  const option = useMemo<EChartsOption | null>(() => {
    const s = q.data;
    if (!s || !s.points.length) return null;
    const ultimo = s.points[s.points.length - 1];
    const cands = [...s.candidates]
      .sort(
        (a, b) =>
          (ultimo.candidates[b.tse_candidate_id]?.votes ?? 0) -
          (ultimo.candidates[a.tse_candidate_id]?.votes ?? 0),
      )
      .slice(0, Math.max(2, topN));
    const x = (p: (typeof s.points)[number]) =>
      eixoX === "t" ? new Date(p.time ?? "").getTime() : p.pct_sections;
    const area = estilo === "area";

    let series: EChartsOption["series"];
    if (metrica === "diferenca" && cands.length >= 2) {
      const [a, b] = cands;
      series = [
        {
          type: "line",
          name: `${a.ballot_name} − ${b.ballot_name}`,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { width: 2.5, color: corCand(a.tse_candidate_id, a.color) },
          itemStyle: { color: corCand(a.tse_candidate_id, a.color) },
          areaStyle: area ? { opacity: 0.15 } : undefined,
          data: s.points.map((p) => [
            x(p),
            (p.candidates[a.tse_candidate_id]?.pct ?? 0) - (p.candidates[b.tse_candidate_id]?.pct ?? 0),
          ]),
        },
      ];
    } else {
      series = cands.map((cd) => ({
        type: "line" as const,
        name: `${cd.ballot_name} (${cd.ballot_number})`,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { width: 2.5, color: corCand(cd.tse_candidate_id, cd.color, cd.ballot_number) },
        itemStyle: { color: corCand(cd.tse_candidate_id, cd.color, cd.ballot_number) },
        areaStyle: area ? { opacity: 0.12 } : undefined,
        emphasis: { focus: "series" as const },
        data: s.points.map((p) => [
          x(p),
          metrica === "votos"
            ? (p.candidates[cd.tse_candidate_id]?.votes ?? 0)
            : (p.candidates[cd.tse_candidate_id]?.pct ?? 0),
        ]),
      }));
    }

    // marcadores de eventos
    if (mostrarEventos && s.events.length && Array.isArray(series) && series.length) {
      const posX = (iso: string) => {
        if (eixoX === "t") return new Date(iso).getTime();
        let v = s.points[0].pct_sections;
        for (const p of s.points) if ((p.time ?? "") <= iso) v = p.pct_sections;
        return v;
      };
      (series[0] as { markLine?: unknown }).markLine = {
        symbol: "none",
        silent: false,
        animation: false,
        label: { show: false },
        lineStyle: { type: "dashed", width: 1, opacity: 0.8 },
        data: s.events.map((e) => ({
          xAxis: posX(e.occurred_at ?? ""),
          name: e.title,
          lineStyle: { color: COR_MANTINE[COR_EVENTO[e.type] ?? "blue"] ?? "#888" },
          tooltip: {
            formatter: `<b>${ROTULO_EVENTO[e.type] ?? e.type}</b><br/>${e.title}<br/>${brt(e.occurred_at).format("HH:mm")}`,
          },
          label: { show: false },
        })),
      };
    }

    const yFmt = (v: number) =>
      metrica === "votos"
        ? fmtNum(v / 1_000_000, 1) + " mi"
        : `${fmtNum(v, 0)}${metrica === "diferenca" ? " p.p." : "%"}`;
    return {
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      legend: {
        type: "scroll",
        top: 0,
        textStyle: { color: c.texto, fontSize: 11 },
        icon: "roundRect",
        itemWidth: 12,
        itemHeight: 6,
      },
      tooltip: {
        trigger: "axis",
        valueFormatter: (v) =>
          metrica === "votos"
            ? fmtInt(Number(v))
            : `${fmtNum(Number(v), 2)}${metrica === "diferenca" ? " p.p." : "%"}`,
        axisPointer: { type: "line" },
      },
      xAxis:
        eixoX === "t"
          ? {
              type: "time",
              axisLabel: {
                color: c.textoFraco,
                formatter: (v: number) => brt(v).format("HH:mm"),
                hideOverlap: true,
              },
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
  if (!option)
    return (
      <SemDados titulo="Sem série histórica ainda">
        A evolução aparece depois dos primeiros snapshots.
      </SemDados>
    );
  return <EChart option={option} height={altura} />;
}
