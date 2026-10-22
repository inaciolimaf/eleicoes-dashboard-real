import type { CandidateResultDto, ResultsWithDataDto } from "../../../api/models";
import { STATE_BY_CODE } from "../../../lib/geo-areas";

export interface ScoreboardOptions {
  topN?: number;
  onlyElected?: boolean;
  showPhotos?: boolean;
  tab?: "candidates" | "parties";
  /** When false the name is not a link to the candidate's page. Default: a link. */
  linkCandidate?: boolean;
}

/** Office code of the president, the only national office. */
const PRESIDENT_OFFICE = 1;
/** Office code of the governor, the other office with a majority rule and a 50% line. */
const GOVERNOR_OFFICE = 3;

/** Where the candidate's situation applies: "no Brasil" for the president, "em UF" otherwise. */
export function whereLabel(result: ResultsWithDataDto): string {
  if (Number(result.office.office_code) === PRESIDENT_OFFICE) return "no Brasil";
  const state = result.geo_area.state_code ?? result.geo_area.breadcrumb.find((b) => b.level === "state")?.id;
  return state ? `em ${state.toUpperCase()}` : "na UF";
}

/** Candidates by votes (ties by ballot position). */
export function orderByVotes(candidates: CandidateResultDto[]): CandidateResultDto[] {
  return [...candidates].sort((a, b) => b.votes - a.votes || a.position - b.position);
}

export function isElected(candidate: CandidateResultDto): boolean {
  return candidate.elected || candidate.status === "ELECTED" || candidate.overall_status === "ELECTED";
}

/** The rows shown: only the elected when asked, and the first `topN` when set. */
export function visibleRows(
  ordered: CandidateResultDto[],
  { onlyElected, topN }: { onlyElected: boolean; topN?: number },
): CandidateResultDto[] {
  const elected = onlyElected ? ordered.filter(isElected) : ordered;
  return topN && topN > 0 ? elected.slice(0, topN) : elected;
}

/** Only the majority offices (president, governor) show the 50% line of the valid votes. */
export function showsMajorityLine(result: ResultsWithDataDto): boolean {
  const code = Number(result.office.office_code);
  return code === PRESIDENT_OFFICE || code === GOVERNOR_OFFICE;
}

/** Header of the candidate list: how many candidates, the seats and the state. */
export function summaryLine(result: ResultsWithDataDto): string {
  const seats = result.office.seats;
  const seatsText = seats && seats > 1 ? `${seats} vagas` : "1 vaga";
  const stateCode = result.geo_area.state_code;
  const stateText =
    stateCode && Number(result.office.office_code) !== PRESIDENT_OFFICE
      ? ` · ${STATE_BY_CODE[stateCode]?.name ?? stateCode.toUpperCase()}`
      : "";
  return `${result.candidates.length} candidato(s) · ${seatsText}${stateText}`;
}
