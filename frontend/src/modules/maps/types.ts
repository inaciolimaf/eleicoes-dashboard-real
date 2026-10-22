/** Kinds of map. The values are stored in the URL (`?tipo=`) and in dashboard widgets: they never change. */
export type MapType =
  "vencedores" | "desempenho" | "comparativo" | "progresso" | "locais" | "comparecimento" | "partido";

/** Map kinds offered to the user. `value`/`label` are the stored value and the label; `proportional` hides it for majoritarian offices. */
export const MAP_TYPES: { value: MapType; label: string; description: string; proportional?: boolean }[] = [
  {
    value: "vencedores",
    label: "Vencedores",
    description: "Cor do líder em cada região; intensidade = margem de vitória",
  },
  {
    value: "desempenho",
    label: "Desempenho",
    description: "% dos votos válidos de um candidato (escala sequencial)",
  },
  {
    value: "comparativo",
    label: "Comparativo A × B",
    description: "Diferença em p.p. entre dois candidatos (escala divergente)",
  },
  { value: "progresso", label: "Progresso", description: "% de seções totalizadas" },
  {
    value: "locais",
    label: "Locais apurados",
    description: "Cada local de votação por status: não recebido, parcial, apurado",
  },
  { value: "comparecimento", label: "Comparecimento", description: "% de comparecimento do eleitorado" },
  {
    value: "partido",
    label: "Partido mais votado",
    description: "Partido/federação mais votado (cargos proporcionais)",
    proportional: true,
  },
];

export const MAP_TYPE_LABELS: Record<MapType, string> = Object.fromEntries(
  MAP_TYPES.map((t) => [t.value, t.label]),
) as Record<MapType, string>;
