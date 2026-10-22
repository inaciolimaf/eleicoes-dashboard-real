import type { EChartsOption } from "echarts";
import type { CandidateResultDto, ResultsWithDataDto } from "../../api/models";
import { fmtInt, fmtPct } from "../../lib/formatting";
import { BLANK_SLICE_COLOR, NULL_SLICE_COLOR, OTHERS_SLICE_COLOR } from "../../lib/palettes/charts";
import type { ChartColors } from "./components/EChart";

export interface DonutInput {
  result: ResultsWithDataDto;
  topN: number;
  includeBlankNull: boolean;
  colors: ChartColors;
  colorOf: (candidate: CandidateResultDto) => string;
}

interface Slice {
  name: string;
  value: number;
  itemStyle: { color: string };
}

/** The top N candidates, the rest grouped as "Outros", and optionally blank and null votes. */
function donutSlices({ result, topN, includeBlankNull, colorOf }: DonutInput): Slice[] {
  const ranked = [...result.candidates].sort((a, b) => b.votes - a.votes);
  const slices: Slice[] = ranked.slice(0, topN).map((candidate) => ({
    name: candidate.ballot_name,
    value: candidate.votes,
    itemStyle: { color: colorOf(candidate) },
  }));
  const othersVotes = ranked.slice(topN).reduce((sum, candidate) => sum + candidate.votes, 0);
  if (othersVotes > 0)
    slices.push({ name: "Outros", value: othersVotes, itemStyle: { color: OTHERS_SLICE_COLOR } });
  if (includeBlankNull) {
    slices.push({
      name: "Brancos",
      value: result.totals.blank_votes,
      itemStyle: { color: BLANK_SLICE_COLOR },
    });
    slices.push({ name: "Nulos", value: result.totals.null_votes, itemStyle: { color: NULL_SLICE_COLOR } });
  }
  return slices;
}

/** Option of the donut chart: slices, tooltip, legend and the total in the center. */
export function buildDonutOption(input: DonutInput): EChartsOption {
  const { colors, includeBlankNull } = input;
  const data = donutSlices(input);
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  return {
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const slice = params as { name: string; value: number; percent: number };
        return `<b>${slice.name}</b><br/>${fmtInt(slice.value)} votos · ${fmtPct(slice.percent)}`;
      },
    },
    legend: {
      type: "scroll",
      bottom: 0,
      textStyle: { color: colors.text, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    graphic: [
      {
        type: "group",
        left: "center",
        top: "38%",
        children: [
          {
            type: "text",
            style: {
              text: fmtInt(total),
              fontSize: 18,
              fontWeight: 800,
              fill: colors.text,
              align: "center",
              fontFamily: "JetBrains Mono",
            },
            left: "center",
          },
          {
            type: "text",
            top: 24,
            style: {
              text: includeBlankNull ? "votos" : "votos válidos",
              fontSize: 11,
              fill: colors.textMuted,
              align: "center",
            },
            left: "center",
          },
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
}
