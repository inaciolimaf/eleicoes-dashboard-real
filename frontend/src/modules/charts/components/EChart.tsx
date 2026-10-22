import ReactEChartsCore from "echarts-for-react/lib/core";
import { useComputedColorScheme } from "@mantine/core";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { echarts } from "../echarts";
import { usePrefs } from "../../../lib/prefs-store";
import { CHART_THEMES, type ChartTheme } from "../../../lib/palettes/charts";

export type ChartColors = ChartTheme;

export function useChartColors(): ChartColors {
  const scheme = useComputedColorScheme("dark");
  return CHART_THEMES[scheme === "dark" ? "dark" : "light"];
}

/** Applies the app's theme (font, colors, animation) under the chart's own options. */
export function themeOption(option: EChartsOption, colors: ChartColors, animate: boolean): EChartsOption {
  return {
    backgroundColor: "transparent",
    animation: animate,
    animationDuration: 600,
    animationDurationUpdate: 500,
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: colors.text },
    tooltip: {
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 12 },
      ...(option.tooltip as object),
    },
    ...option,
  } as EChartsOption;
}

interface EChartProps {
  option: EChartsOption;
  height?: number | string;
  onEvents?: Record<string, (params: unknown) => void>;
}

/** Wrapper around ECharts that follows the app's light/dark theme and fonts. */
export function EChart({ option, height = "100%", onEvents }: EChartProps) {
  const colors = useChartColors();
  const animate = usePrefs((s) => s.animacoes);
  const themed = useMemo(() => themeOption(option, colors, animate), [option, colors, animate]);
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={themed}
      notMerge
      lazyUpdate
      style={{ height, width: "100%" }}
      onEvents={onEvents}
      opts={{ renderer: "canvas" }}
    />
  );
}
