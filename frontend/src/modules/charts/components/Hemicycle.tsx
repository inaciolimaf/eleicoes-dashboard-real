import { useMemo } from "react";
import type { AllianceDto } from "../../../api/models";
import { buildHemicycleOption } from "../hemicycleOption";
import { EChart } from "./EChart";

/** Parliament chart: one dot per seat, grouped by alliance. */
export function Hemicycle({
  alliances,
  height = 260,
}: {
  alliances: AllianceDto[];
  height?: number | string;
}) {
  const option = useMemo(() => buildHemicycleOption(alliances), [alliances]);
  return <EChart option={option} height={height} />;
}
