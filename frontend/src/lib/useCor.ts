import { useCallback } from "react";
import { usePrefs } from "../store/prefs";
import { corPorNumero } from "./cores";

/** Cor de um candidato, respeitando a preferência do usuário. */
export function useCorCandidato() {
  const cores = usePrefs((s) => s.coresCandidatos);
  return useCallback(
    (sqcand: string | null | undefined, padrao?: string | null, numero?: number | null) =>
      (sqcand ? cores[sqcand] : undefined) ?? padrao ?? (numero != null ? corPorNumero(numero) : "#8592AD"),
    [cores],
  );
}
