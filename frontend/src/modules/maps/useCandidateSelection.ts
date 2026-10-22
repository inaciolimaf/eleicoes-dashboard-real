import { useEffect, useState } from "react";
import type { ChildCandidateDto } from "../../api/models";

/**
 * The candidates shown in the selectors A and B. The props set them; the user can change them
 * on the map. Without a choice, A is the first candidate and B is the next one.
 */
export function useCandidateSelection(
  candidateA: string | null | undefined,
  candidateB: string | null | undefined,
  candidates: ChildCandidateDto[] | undefined,
) {
  const [choiceA, setChoiceA] = useState<string | null>(candidateA ?? null);
  const [choiceB, setChoiceB] = useState<string | null>(candidateB ?? null);
  useEffect(() => setChoiceA(candidateA ?? null), [candidateA]);
  useEffect(() => setChoiceB(candidateB ?? null), [candidateB]);
  const efA = choiceA ?? candidates?.[0]?.tse_candidate_id ?? null;
  const efB = choiceB ?? candidates?.find((c) => c.tse_candidate_id !== efA)?.tse_candidate_id ?? null;
  return { efA, efB, setChoiceA, setChoiceB };
}
