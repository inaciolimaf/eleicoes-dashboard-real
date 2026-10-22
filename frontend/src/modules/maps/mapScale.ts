import type { ChildItemDto } from "../../api/models";
import type { MapType } from "./types";

/** Value range of a map's color scale. `suffix` is the unit shown next to the bounds. */
export interface MapScale {
  min: number;
  max: number;
  suffix: string;
}

/** Scale of the current map: from the data for performance, comparison and turnout; fixed otherwise. */
export function mapScaleOf(
  type: MapType,
  items: ChildItemDto[],
  candidateA: string | null,
  candidateB: string | null,
): MapScale {
  if (type === "desempenho" && candidateA) {
    const max = Math.max(1, ...items.map((i) => i.values?.[candidateA] ?? 0));
    return { min: 0, max: Math.ceil(max / 5) * 5, suffix: "%" };
  }
  if (type === "comparativo" && candidateA && candidateB) {
    const max = Math.max(
      1,
      ...items.map((i) => Math.abs((i.values?.[candidateA] ?? 0) - (i.values?.[candidateB] ?? 0))),
    );
    return { min: -Math.ceil(max), max: Math.ceil(max), suffix: " p.p." };
  }
  if (type === "comparecimento") {
    const rates = items
      .filter((i) => i.electorate > 0 && i.turnout > 0)
      .map((i) => (i.turnout / i.electorate) * 100);
    if (!rates.length) return { min: 0, max: 100, suffix: "%" };
    return { min: Math.floor(Math.min(...rates)), max: Math.ceil(Math.max(...rates)), suffix: "%" };
  }
  return { min: 0, max: 100, suffix: "%" };
}
