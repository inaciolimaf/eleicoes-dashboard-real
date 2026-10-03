import ReactEChartsCore from "echarts-for-react/lib/core";
import { useComputedColorScheme } from "@mantine/core";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { echarts } from "./echarts";
import { usePrefs } from "../../store/prefs";

export interface CoresGrafico {
  texto: string;
  textoFraco: string;
  linha: string;
  fundoTooltip: string;
  borda: string;
}

export function useCoresGrafico(): CoresGrafico {
  const esquema = useComputedColorScheme("dark");
  return esquema === "dark"
    ? { texto: "#D5DCEB", textoFraco: "#8592AD", linha: "#1F2A44", fundoTooltip: "#111A2E", borda: "#26324D" }
    : { texto: "#1f2937", textoFraco: "#6b7280", linha: "#e5e7eb", fundoTooltip: "#ffffff", borda: "#d1d5db" };
}

interface Props {
  option: EChartsOption;
  height?: number | string;
  onEvents?: Record<string, (p: unknown) => void>;
}

/** Wrapper do ECharts com tema claro/escuro e fontes do app. */
export function EChart({ option, height = "100%", onEvents }: Props) {
  const c = useCoresGrafico();
  const animacoes = usePrefs((s) => s.animacoes);
  const opt = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      animation: animacoes,
      animationDuration: 600,
      animationDurationUpdate: 500,
      textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: c.texto },
      tooltip: {
        backgroundColor: c.fundoTooltip,
        borderColor: c.borda,
        textStyle: { color: c.texto, fontSize: 12 },
        ...(option.tooltip as object),
      },
      ...option,
    }) as EChartsOption,
    [option, c, animacoes],
  );
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={opt}
      notMerge
      lazyUpdate
      style={{ height, width: "100%" }}
      onEvents={onEvents}
      opts={{ renderer: "canvas" }}
    />
  );
}
