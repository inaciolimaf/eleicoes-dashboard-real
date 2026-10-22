import { useMemo } from "react";
import type { Level } from "../../../api/models";
import { useSeries } from "../hooks";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { useCandidateColor } from "../../../lib/useColor";
import { Loading, ErrorView, NoData } from "../../../components/States";
import {
  buildEvolutionOption,
  type EvolutionAxis,
  type EvolutionMetric,
  type EvolutionStyle,
} from "../evolutionOption";
import { EChart, useChartColors } from "./EChart";

export interface EvolutionProps {
  level?: Level;
  id?: string;
  xAxis?: EvolutionAxis;
  metric?: EvolutionMetric;
  style?: EvolutionStyle;
  topN?: number;
  height?: number | string;
  showEvents?: boolean;
}

/** Evolution chart: each followed candidate over time (or section percentage), with the events as markers. */
export function Evolution({
  level,
  id,
  xAxis = "t",
  metric = "pct",
  style = "linha",
  topN = 6,
  height = 300,
  showEvents = true,
}: EvolutionProps) {
  const filter = useEffectiveFilter();
  const query = useSeries({
    turno: filter.turno,
    cargo: filter.cargo,
    nivel: level ?? filter.nivel,
    id: id ?? filter.id,
    t: filter.t,
  });
  const candidateColor = useCandidateColor();
  const colors = useChartColors();
  const option = useMemo(
    () =>
      query.data
        ? buildEvolutionOption({
            series: query.data,
            axis: xAxis,
            metric,
            style,
            topN,
            showEvents,
            colors,
            colorOf: candidateColor,
          })
        : null,
    [query.data, xAxis, metric, style, topN, showEvents, candidateColor, colors],
  );

  if (query.isLoading) return <Loading altura={height} />;
  if (query.error) return <ErrorView erro={query.error} onRetry={() => query.refetch()} />;
  if (!option)
    return (
      <NoData titulo="Sem série histórica ainda">A evolução aparece depois dos primeiros snapshots.</NoData>
    );
  return <EChart option={option} height={height} />;
}
