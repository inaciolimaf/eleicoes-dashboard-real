export type TipoMapa =
  | "vencedores"
  | "desempenho"
  | "comparativo"
  | "progresso"
  | "locais"
  | "comparecimento"
  | "partido";

export const TIPOS_MAPA: { valor: TipoMapa; rotulo: string; descricao: string; proporcional?: boolean }[] = [
  { valor: "vencedores", rotulo: "Vencedores", descricao: "Cor do líder em cada região; intensidade = margem de vitória" },
  { valor: "desempenho", rotulo: "Desempenho", descricao: "% dos votos válidos de um candidato (escala sequencial)" },
  { valor: "comparativo", rotulo: "Comparativo A × B", descricao: "Diferença em p.p. entre dois candidatos (escala divergente)" },
  { valor: "progresso", rotulo: "Progresso", descricao: "% de seções totalizadas" },
  { valor: "locais", rotulo: "Locais apurados", descricao: "Cada local de votação por status: não recebido, parcial, apurado" },
  { valor: "comparecimento", rotulo: "Comparecimento", descricao: "% de comparecimento do eleitorado" },
  { valor: "partido", rotulo: "Partido mais votado", descricao: "Partido/federação mais votado (cargos proporcionais)", proporcional: true },
];

export const ROTULO_TIPO_MAPA: Record<TipoMapa, string> = Object.fromEntries(
  TIPOS_MAPA.map((t) => [t.valor, t.rotulo]),
) as Record<TipoMapa, string>;
