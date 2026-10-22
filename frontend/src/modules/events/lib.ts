/** Label and color of each event type (the API values are English; the label is product text in Portuguese). */
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
