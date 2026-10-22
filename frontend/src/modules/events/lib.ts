/** Rótulo e cor de cada tipo de evento (valores da API em inglês; o texto é do produto). */
export const EVENT_LABELS: Record<string, string> = {
  start: "Início da divulgação",
  milestone: "Marco da apuração",
  lead_change: "Virada",
  elected: "Eleito",
  mathematically_decided: "Matematicamente definido",
  runoff: "2º turno",
};

export const EVENT_COLORS: Record<string, string> = {
  start: "cyan",
  milestone: "blue",
  lead_change: "orange",
  elected: "green",
  mathematically_decided: "teal",
  runoff: "yellow",
};
