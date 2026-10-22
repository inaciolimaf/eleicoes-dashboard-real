import { useCallback } from "react";
import { usePrefs } from "./prefs-store";
import { colorByNumber } from "./palettes";

/** Cor de um candidato, respeitando a preferência do usuário. */
export function useCandidateColor() {
  const cores = usePrefs((s) => s.coresCandidatos);
  return useCallback(
    (sqcand: string | null | undefined, padrao?: string | null, numero?: number | null) =>
      (sqcand ? cores[sqcand] : undefined) ?? padrao ?? (numero != null ? colorByNumber(numero) : "#8592AD"),
    [cores],
  );
}
