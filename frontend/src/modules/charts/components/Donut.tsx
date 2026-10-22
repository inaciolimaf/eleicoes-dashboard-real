import { useMemo } from "react";
import type { ResultsWithDataDto } from "../../../api/models";
import { useCandidateColor } from "../../../lib/useColor";
import { buildDonutOption } from "../donutOption";
import { EChart, useChartColors } from "./EChart";

interface DonutProps {
  result: ResultsWithDataDto;
  topN?: number;
  includeBlankNull?: boolean;
  height?: number | string;
}

/** Donut chart of the most-voted candidates, optionally with blank and null votes. */
export function Donut({ result, topN = 6, includeBlankNull = false, height = 280 }: DonutProps) {
  const candidateColor = useCandidateColor();
  const colors = useChartColors();
  const option = useMemo(
    () =>
      buildDonutOption({
        result,
        topN,
        includeBlankNull,
        colors,
        colorOf: (candidate) =>
          candidateColor(candidate.tse_candidate_id, candidate.color, candidate.ballot_number),
      }),
    [result, topN, includeBlankNull, candidateColor, colors],
  );
  return <EChart option={option} height={height} />;
}
