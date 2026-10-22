import type { EChartsOption } from "echarts";
import type { EventDto, SeriesCandidateDto, SeriesDto, SeriesPointDto } from "../../api/models";
import { brt } from "../../lib/time";
import { fmtInt, fmtNum } from "../../lib/formatting";
import { EVENT_LINE_COLORS, FALLBACK_EVENT_LINE_COLOR } from "../../lib/palettes/charts";
import { EVENT_COLORS, EVENT_LABELS } from "../events";
import type { ChartColors } from "./components/EChart";

export type EvolutionAxis = "t" | "pct_secoes";
export type EvolutionMetric = "pct" | "votos" | "diferenca";
export type EvolutionStyle = "linha" | "area";

/** Candidate color lookup, the same signature as `useCandidateColor`. */
export type CandidateColorOf = (id: string, color?: string, number?: number | null) => string;

export interface EvolutionInput {
  series: SeriesDto;
  axis: EvolutionAxis;
  metric: EvolutionMetric;
  style: EvolutionStyle;
  topN: number;
  showEvents: boolean;
  colors: ChartColors;
  colorOf: CandidateColorOf;
}

interface LineSeries {
  type: "line";
  name: string;
  showSymbol: boolean;
  smooth: number;
  lineStyle: { width: number; color: string };
  itemStyle: { color: string };
  areaStyle: { opacity: number } | undefined;
  emphasis?: { focus: "series" };
  data: [number, number][];
  markLine?: unknown;
}

/** The candidates followed in the chart: the top N on the last point (at least two). */
function followedCandidates(series: SeriesDto, topN: number): SeriesCandidateDto[] {
  const last = series.points[series.points.length - 1];
  return [...series.candidates]
    .sort(
      (a, b) =>
        (last.candidates[b.tse_candidate_id]?.votes ?? 0) - (last.candidates[a.tse_candidate_id]?.votes ?? 0),
    )
    .slice(0, Math.max(2, topN));
}

function pointX(point: SeriesPointDto, axis: EvolutionAxis): number {
  return axis === "t" ? new Date(point.time ?? "").getTime() : point.pct_sections;
}

/** Difference between the first two candidates, in percentage points. */
function marginSeries(input: EvolutionInput, [first, second]: SeriesCandidateDto[]): LineSeries {
  const { series, colorOf, style } = input;
  const color = colorOf(first.tse_candidate_id, first.color);
  return {
    type: "line",
    name: `${first.ballot_name} − ${second.ballot_name}`,
    showSymbol: false,
    smooth: 0.2,
    lineStyle: { width: 2.5, color },
    itemStyle: { color },
    areaStyle: style === "area" ? { opacity: 0.15 } : undefined,
    data: series.points.map((point) => [
      pointX(point, input.axis),
      (point.candidates[first.tse_candidate_id]?.pct ?? 0) -
        (point.candidates[second.tse_candidate_id]?.pct ?? 0),
    ]),
  };
}

/** One line per followed candidate, with votes or percentages. */
function candidateSeries(input: EvolutionInput, candidates: SeriesCandidateDto[]): LineSeries[] {
  const { series, colorOf, metric, style } = input;
  return candidates.map((candidate) => {
    const color = colorOf(candidate.tse_candidate_id, candidate.color, candidate.ballot_number);
    return {
      type: "line" as const,
      name: `${candidate.ballot_name} (${candidate.ballot_number})`,
      showSymbol: false,
      smooth: 0.2,
      lineStyle: { width: 2.5, color },
      itemStyle: { color },
      areaStyle: style === "area" ? { opacity: 0.12 } : undefined,
      emphasis: { focus: "series" as const },
      data: series.points.map((point) => [
        pointX(point, input.axis),
        metric === "votos"
          ? (point.candidates[candidate.tse_candidate_id]?.votes ?? 0)
          : (point.candidates[candidate.tse_candidate_id]?.pct ?? 0),
      ]),
    };
  });
}

/** Position of an event on the x axis: its time, or the section percentage at that time. */
function eventX(points: SeriesPointDto[], axis: EvolutionAxis, iso: string): number {
  if (axis === "t") return new Date(iso).getTime();
  let value = points[0].pct_sections;
  for (const point of points) if ((point.time ?? "") <= iso) value = point.pct_sections;
  return value;
}

/** Dashed vertical markers for the events, drawn on the first line. */
function eventMarkLine(input: EvolutionInput): unknown {
  const { series, axis } = input;
  return {
    symbol: "none",
    silent: false,
    animation: false,
    label: { show: false },
    lineStyle: { type: "dashed", width: 1, opacity: 0.8 },
    data: series.events.map((event: EventDto) => {
      const mapColor = EVENT_COLORS[event.type] ?? "blue";
      return {
        xAxis: eventX(series.points, axis, event.occurred_at ?? ""),
        name: event.title,
        lineStyle: { color: EVENT_LINE_COLORS[mapColor] ?? FALLBACK_EVENT_LINE_COLOR },
        tooltip: {
          formatter: `<b>${EVENT_LABELS[event.type] ?? event.type}</b><br/>${event.title}<br/>${brt(event.occurred_at).format("HH:mm")}`,
        },
        label: { show: false },
      };
    }),
  };
}

function valueFormatter(metric: EvolutionMetric) {
  return (value: unknown) =>
    metric === "votos"
      ? fmtInt(Number(value))
      : `${fmtNum(Number(value), 2)}${metric === "diferenca" ? " p.p." : "%"}`;
}

function axisLabelFormatter(metric: EvolutionMetric) {
  return (value: number) =>
    metric === "votos"
      ? `${fmtNum(value / 1_000_000, 1)} mi`
      : `${fmtNum(value, 0)}${metric === "diferenca" ? " p.p." : "%"}`;
}

function xAxisOf(axis: EvolutionAxis, colors: ChartColors) {
  if (axis === "t")
    return {
      type: "time" as const,
      axisLabel: {
        color: colors.textMuted,
        formatter: (value: number) => brt(value).format("HH:mm"),
        hideOverlap: true,
      },
      axisLine: { lineStyle: { color: colors.line } },
      splitLine: { show: false },
    };
  return {
    type: "value" as const,
    min: 0,
    max: 100,
    name: "% seções",
    nameLocation: "end" as const,
    nameTextStyle: { color: colors.textMuted, fontSize: 10 },
    axisLabel: { color: colors.textMuted, formatter: "{value}%" },
    axisLine: { lineStyle: { color: colors.line } },
    splitLine: { show: false },
  };
}

function buildSeries(input: EvolutionInput): LineSeries[] {
  const candidates = followedCandidates(input.series, input.topN);
  if (input.metric === "diferenca" && candidates.length >= 2) return [marginSeries(input, candidates)];
  return candidateSeries(input, candidates);
}

/**
 * Option of the evolution chart: the followed candidates over time (or over the section percentage),
 * with the events as markers. Null when there is no point yet.
 */
export function buildEvolutionOption(input: EvolutionInput): EChartsOption | null {
  const { series, metric, colors, axis, showEvents } = input;
  if (!series.points.length) return null;
  const lines = buildSeries(input);
  if (showEvents && series.events.length && lines.length) lines[0].markLine = eventMarkLine(input);
  return {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: {
      type: "scroll",
      top: 0,
      textStyle: { color: colors.text, fontSize: 11 },
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 6,
    },
    tooltip: {
      trigger: "axis",
      valueFormatter: valueFormatter(metric),
      axisPointer: { type: "line" },
    },
    xAxis: xAxisOf(axis, colors),
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { color: colors.textMuted, formatter: axisLabelFormatter(metric) },
      splitLine: { lineStyle: { color: colors.line } },
    },
    series: lines,
  } as EChartsOption;
}
