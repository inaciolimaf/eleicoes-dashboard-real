/** Colors of the chart frame (text, grid, tooltip), by Mantine color scheme. */
export interface ChartTheme {
  text: string;
  textMuted: string;
  line: string;
  tooltipBackground: string;
  border: string;
}

export const CHART_THEMES: Record<"dark" | "light", ChartTheme> = {
  dark: {
    text: "#D5DCEB",
    textMuted: "#8592AD",
    line: "#1F2A44",
    tooltipBackground: "#111A2E",
    border: "#26324D",
  },
  light: {
    text: "#1f2937",
    textMuted: "#6b7280",
    line: "#e5e7eb",
    tooltipBackground: "#ffffff",
    border: "#d1d5db",
  },
};

/** Slice of the donut that groups the candidates outside the top N. */
export const OTHERS_SLICE_COLOR = "#64748B";
export const BLANK_SLICE_COLOR = "#CBD5E1";
export const NULL_SLICE_COLOR = "#475569";

/** Caption under the seat count of the hemicycle. */
export const SEAT_CAPTION_COLOR = "#8592AD";

/** Lines of the event markers, by the Mantine color name the event palette uses. */
export const EVENT_LINE_COLORS: Record<string, string> = {
  orange: "#F97316",
  blue: "#3D7BFF",
  green: "#22C55E",
  yellow: "#EAB308",
  teal: "#14B8A6",
  grape: "#A855F7",
  cyan: "#06B6D4",
};

export const FALLBACK_EVENT_LINE_COLOR = "#888";
