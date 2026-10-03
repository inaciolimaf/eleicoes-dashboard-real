import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { ResultadosComDados } from "../../api/types";
import { useCorCandidato } from "../../lib/useCor";
import { fmtInt, fmtPct } from "../../lib/format";
import { EChart, useCoresGrafico } from "./EChart";

export function Rosca({
  res,
  topN = 6,
  incluirBrancosNulos = false,
  altura = 280,
}: {
  res: ResultadosComDados;
  topN?: number;
  incluirBrancosNulos?: boolean;
  altura?: number | string;
}) {
  const corCand = useCorCandidato();
  const c = useCoresGrafico();
  const option = useMemo<EChartsOption>(() => {
    const ord = [...res.candidatos].sort((a, b) => b.votos - a.votos);
    const top = ord.slice(0, topN);
    const outros = ord.slice(topN).reduce((s, x) => s + x.votos, 0);
    const data = top.map((x) => ({ name: x.nome_urna, value: x.votos, itemStyle: { color: corCand(x.sqcand, x.cor, x.numero) } }));
    if (outros > 0) data.push({ name: "Outros", value: outros, itemStyle: { color: "#64748B" } });
    if (incluirBrancosNulos) {
      data.push({ name: "Brancos", value: res.totais.brancos, itemStyle: { color: "#CBD5E1" } });
      data.push({ name: "Nulos", value: res.totais.nulos, itemStyle: { color: "#475569" } });
    }
    const total = data.reduce((s, d) => s + d.value, 0);
    return {
      tooltip: {
        trigger: "item",
        formatter: (p: unknown) => {
          const x = p as { name: string; value: number; percent: number };
          return `<b>${x.name}</b><br/>${fmtInt(x.value)} votos · ${fmtPct(x.percent)}`;
        },
      },
      legend: { type: "scroll", bottom: 0, textStyle: { color: c.texto, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
      graphic: [
        {
          type: "group",
          left: "center",
          top: "38%",
          children: [
            { type: "text", style: { text: fmtInt(total), fontSize: 18, fontWeight: 800, fill: c.texto, align: "center", fontFamily: "JetBrains Mono" }, left: "center" },
            { type: "text", top: 24, style: { text: incluirBrancosNulos ? "votos" : "votos válidos", fontSize: 11, fill: c.textoFraco, align: "center" }, left: "center" },
          ],
        },
      ],
      series: [
        {
          type: "pie",
          radius: ["52%", "78%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: "transparent", borderWidth: 2 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 6 },
          data,
        },
      ],
    } as EChartsOption;
  }, [res, topN, incluirBrancosNulos, corCand, c]);
  return <EChart option={option} height={altura} />;
}
