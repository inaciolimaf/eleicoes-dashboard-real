import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Agremiacao } from "../../api/types";
import { EChart } from "./EChart";
import { fmtInt } from "../../lib/format";

/** Distribui `total` assentos em fileiras concêntricas de um semicírculo (parlamento). */
function posicoes(total: number): { x: number; y: number }[] {
  if (total <= 0) return [];
  let fileiras = 1;
  while (true) {
    let cap = 0;
    for (let i = 0; i < fileiras; i++) cap += Math.floor(Math.PI * (fileiras + i) / 1.0);
    if (cap >= total || fileiras > 30) break;
    fileiras++;
  }
  const raios = Array.from({ length: fileiras }, (_, i) => fileiras + i);
  const somaR = raios.reduce((a, b) => a + b, 0);
  const pontos: { x: number; y: number; ang: number }[] = [];
  let restante = total;
  raios.forEach((r, idx) => {
    const n = idx === raios.length - 1 ? restante : Math.round((total * r) / somaR);
    restante -= n;
    for (let k = 0; k < n; k++) {
      const ang = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * k) / (n - 1);
      pontos.push({ x: r * Math.cos(ang), y: r * Math.sin(ang), ang });
    }
  });
  // ordena da esquerda para a direita pelo ângulo para pintar blocos contíguos
  return pontos.sort((a, b) => b.ang - a.ang).map(({ x, y }) => ({ x, y }));
}

export function Hemiciclo({ agremiacoes, height = 260 }: { agremiacoes: Agremiacao[]; height?: number | string }) {
  const option = useMemo<EChartsOption>(() => {
    const comVagas = agremiacoes.filter((a) => a.vagas > 0).sort((a, b) => b.vagas - a.vagas);
    const total = comVagas.reduce((s, a) => s + a.vagas, 0);
    const pts = posicoes(total);
    let i = 0;
    const series = comVagas.map((a) => {
      const data = pts.slice(i, i + a.vagas).map((p) => [p.x, p.y]);
      i += a.vagas;
      return {
        type: "scatter" as const,
        name: a.nome,
        data,
        symbolSize: Math.max(5, Math.min(18, 260 / Math.sqrt(Math.max(total, 1) * 3))),
        itemStyle: { color: a.cor },
        emphasis: { scale: 1.4 },
        tooltip: {
          formatter: () => `<b>${a.nome}</b><br/>${a.partidos.join(" · ")}<br/>${a.vagas} vaga(s) · ${fmtInt(a.votos)} votos`,
        },
      };
    });
    const r = pts.reduce((m, p) => Math.max(m, Math.abs(p.x), p.y), 1);
    return {
      tooltip: { trigger: "item" },
      grid: { left: 4, right: 4, top: 4, bottom: 28 },
      xAxis: { show: false, min: -r - 1, max: r + 1 },
      yAxis: { show: false, min: -0.5, max: r + 1 },
      graphic: [
        {
          type: "text",
          left: "center",
          bottom: 4,
          style: { text: `${total} vagas`, fontSize: 14, fontWeight: 700, fill: "#8592AD" },
        },
      ],
      series,
    } as EChartsOption;
  }, [agremiacoes]);
  return <EChart option={option} height={height} />;
}
