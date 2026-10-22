import { useCallback } from "react";
import { usePrefs } from "./prefs-store";
import { colorByNumber, FALLBACK_CANDIDATE_COLOR } from "./palettes";

/** Color of a candidate, honoring the user's preference (stored by candidate id). */
export function useCandidateColor() {
  const savedColors = usePrefs((s) => s.coresCandidatos);
  return useCallback(
    (tseCandidateId: string | null | undefined, defaultColor?: string | null, ballotNumber?: number | null) =>
      (tseCandidateId ? savedColors[tseCandidateId] : undefined) ??
      defaultColor ??
      (ballotNumber != null ? colorByNumber(ballotNumber) : FALLBACK_CANDIDATE_COLOR),
    [savedColors],
  );
}
