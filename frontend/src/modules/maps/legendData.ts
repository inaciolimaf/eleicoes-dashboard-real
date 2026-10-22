import type { ChildrenDto, MapPollingPlaceDto, TallyStatus } from "../../api/models";
import type { CandidateColorFn } from "./mapColors";
import type { MapMode } from "./mapScope";

/** One candidate in the winners legend. */
export interface LegendItem {
  tseCandidateId: string;
  label: string;
  color: string;
  wins: number;
}

/** Candidates for the winners legend: from the polling places (mode `pontos`) or from the regions. */
export function legendItemsOf(
  mode: MapMode,
  places: MapPollingPlaceDto[],
  children: ChildrenDto | undefined,
  candidateColor: CandidateColorFn,
): LegendItem[] {
  if (mode === "pontos") {
    const byCandidate = new Map<string, LegendItem>();
    for (const place of places) {
      if (!place.leader) continue;
      const existing = byCandidate.get(place.leader.tse_candidate_id);
      if (existing) existing.wins++;
      else
        byCandidate.set(place.leader.tse_candidate_id, {
          tseCandidateId: place.leader.tse_candidate_id,
          label: place.leader.ballot_name,
          color: candidateColor(place.leader.tse_candidate_id, place.leader.color),
          wins: 1,
        });
    }
    return [...byCandidate.values()].sort((a, b) => b.wins - a.wins);
  }
  return (children?.candidates ?? [])
    .map((c) => ({
      tseCandidateId: c.tse_candidate_id,
      label: `${c.ballot_name} (${c.ballot_number})`,
      color: candidateColor(c.tse_candidate_id, c.color, c.ballot_number),
      wins: c.wins,
    }))
    .sort((a, b) => b.wins - a.wins);
}

/** Municipalities won per candidate, from the country-wide children; null while loading. */
export function municipalityWins(children: ChildrenDto | undefined): Map<string, number> | null {
  if (!children) return null;
  return new Map(children.candidates.map((c) => [c.tse_candidate_id, c.wins]));
}

/** Number of polling places per tally status. */
export function countByStatus(places: MapPollingPlaceDto[]): Partial<Record<TallyStatus, number>> {
  const counts: Record<string, number> = {};
  for (const place of places) counts[place.status] = (counts[place.status] ?? 0) + 1;
  return counts;
}

/** Parties that lead at least one region, most regions first. */
export function partyTotals(
  children: ChildrenDto | undefined,
): { abbreviation: string; color: string; count: number }[] {
  const byParty = new Map<string, { abbreviation: string; color: string; count: number }>();
  for (const item of children?.items ?? []) {
    if (!item.leader_party) continue;
    const existing = byParty.get(item.leader_party.abbreviation);
    if (existing) existing.count++;
    else
      byParty.set(item.leader_party.abbreviation, {
        abbreviation: item.leader_party.abbreviation,
        color: item.leader_party.color,
        count: 1,
      });
  }
  return [...byParty.values()].sort((a, b) => b.count - a.count);
}
