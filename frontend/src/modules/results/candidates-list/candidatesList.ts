import type { CandidateDto } from "../../../api/models";
import { stripAccents } from "../../../lib/formatting";

/** Most candidates drawn at once; the rest waits for a narrower search. */
export const MAX_SHOWN_CANDIDATES = 600;

/** Distinct party abbreviations, sorted, for the party filter. */
export function partyOptions(candidates: CandidateDto[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.party_abbreviation))].sort();
}

/** Candidates of one party (when given) whose name, ballot name, number or party matches the search. */
export function filterCandidates(
  candidates: CandidateDto[],
  { search, party }: { search: string; party: string | null },
): CandidateDto[] {
  const needle = stripAccents(search.trim());
  return candidates
    .filter((candidate) => !party || candidate.party_abbreviation === party)
    .filter(
      (candidate) =>
        !needle ||
        stripAccents(
          `${candidate.ballot_name} ${candidate.name} ${candidate.ballot_number} ${candidate.party_abbreviation}`,
        ).includes(needle),
    )
    .sort((a, b) => (a.ballot_number ?? 0) - (b.ballot_number ?? 0));
}
