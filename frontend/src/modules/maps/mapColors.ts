import type { ChildItemDto, MapPollingPlaceDto } from "../../api/models";
import { STATUS_COLORS, divergingColor, hexToRgb, marginAlpha, sequentialColor } from "../../lib/palettes";
import type { useCandidateColor } from "../../lib/useColor";
import type { MapScale } from "./mapScale";
import type { MapType } from "./types";

/** [r, g, b, alpha] as deck.gl expects it. */
export type RGBA = [number, number, number, number];

export type CandidateColorFn = ReturnType<typeof useCandidateColor>;

const NO_DATA_FILL: RGBA = [128, 128, 128, 60];

/** A region without data: no leader, no votes, or not received yet. */
export function hasNoData(item: ChildItemDto | undefined | null): boolean {
  return (
    !item ||
    (item.status === "not_received" && !item.valid_votes) ||
    (!item.pct_sections && !item.valid_votes)
  );
}

export interface RegionColorContext {
  type: MapType;
  dark: boolean;
  /** the candidate highlighted in the legend, or null */
  highlight: string | null;
  candidateColor: CandidateColorFn;
  candidateA: string | null;
  candidateB: string | null;
  scale: MapScale;
  colorA?: string;
  colorB?: string;
}

function winnerFill(item: ChildItemDto, ctx: RegionColorContext): RGBA {
  if (!item.leader) return [128, 128, 128, 60];
  if (ctx.highlight && item.leader.tse_candidate_id !== ctx.highlight)
    return ctx.dark ? [60, 68, 88, 90] : [200, 204, 212, 140];
  const [r, g, b] = hexToRgb(ctx.candidateColor(item.leader.tse_candidate_id, item.leader.color));
  return [r, g, b, Math.round(marginAlpha(item.margin_pp) * 255)];
}

/** Fill color of a state or municipality for the current map kind. */
export function regionColor(item: ChildItemDto | undefined, ctx: RegionColorContext): RGBA {
  if (ctx.type === "locais") return [0, 0, 0, 0];
  if (hasNoData(item) || !item) return ctx.dark ? [70, 80, 100, 70] : [170, 175, 185, 90];
  switch (ctx.type) {
    case "vencedores":
      return winnerFill(item, ctx);
    case "desempenho": {
      const value = ctx.candidateA ? item.values?.[ctx.candidateA] : undefined;
      if (value === undefined) return NO_DATA_FILL;
      const [r, g, b] = sequentialColor(value / (ctx.scale.max || 100));
      return [r, g, b, 225];
    }
    case "comparativo": {
      const a = ctx.candidateA ? item.values?.[ctx.candidateA] : undefined;
      const b = ctx.candidateB ? item.values?.[ctx.candidateB] : undefined;
      if (a === undefined || b === undefined) return NO_DATA_FILL;
      const [r, g, bl] = divergingColor((a - b) / (ctx.scale.max || 1), ctx.colorA, ctx.colorB);
      return [r, g, bl, 230];
    }
    case "progresso": {
      const [r, g, b] = sequentialColor(item.pct_sections / 100);
      return [r, g, b, 225];
    }
    case "comparecimento": {
      if (!item.electorate) return NO_DATA_FILL;
      const rate = (item.turnout / item.electorate) * 100;
      const [r, g, b] = sequentialColor((rate - ctx.scale.min) / Math.max(1, ctx.scale.max - ctx.scale.min));
      return [r, g, b, 225];
    }
    case "partido": {
      if (!item.leader_party) return NO_DATA_FILL;
      const [r, g, b] = hexToRgb(item.leader_party.color);
      return [r, g, b, 215];
    }
  }
  return NO_DATA_FILL;
}

/** Fill color of a polling place: the status, or the winner's color on the winner-based maps. */
export function pollingPlaceColor(
  place: MapPollingPlaceDto,
  type: MapType,
  highlight: string | null,
  candidateColor: CandidateColorFn,
): RGBA {
  const winnerBased =
    type === "vencedores" || type === "partido" || type === "desempenho" || type === "comparativo";
  if (!winnerBased) {
    const [r, g, b] = hexToRgb(STATUS_COLORS[place.status]);
    return [r, g, b, 230];
  }
  if (!place.leader) {
    const [r, g, b] = hexToRgb(STATUS_COLORS[place.status]);
    return [r, g, b, 200];
  }
  if (highlight && place.leader.tse_candidate_id !== highlight) return [120, 128, 145, 110];
  const [r, g, b] = hexToRgb(candidateColor(place.leader.tse_candidate_id, place.leader.color));
  return [r, g, b, Math.round(Math.max(0.55, marginAlpha(place.margin_pp)) * 255)];
}
