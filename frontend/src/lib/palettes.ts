import type { CandidateStatus } from "../api/models";

/** Neutral categorical palette of 12 colors (no ideological meaning), well separated in dark and light themes. */
export const PALETTE = [
  "#3D7BFF",
  "#F5A524",
  "#14B8A6",
  "#E5484D",
  "#8B5CF6",
  "#84CC16",
  "#EC4899",
  "#06B6D4",
  "#F97316",
  "#A3A3A3",
  "#6366F1",
  "#EAB308",
];

/** Color that a candidate or party gets when it has none of its own. */
export const FALLBACK_CANDIDATE_COLOR = "#8592AD";
/** Background of the dark theme (also the background of exported images). */
export const DARK_BACKGROUND = "#0B1220";

export const colorByIndex = (i: number) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
/** Traditional color of each party, by its number (same table as the backend). */
export const PARTY_COLORS: Record<number, string> = {
  10: "#1F6FB2",
  11: "#5DA9E9",
  12: "#E4572E",
  13: "#D7191C",
  14: "#2E7D32",
  15: "#2E9E48",
  16: "#B71C1C",
  18: "#F28C28",
  19: "#22B14C",
  20: "#1B7F3A",
  21: "#C62828",
  22: "#0B3D91",
  23: "#E6007E",
  25: "#1E4FA0",
  27: "#7CB342",
  28: "#00897B",
  29: "#8E0000",
  30: "#F26522",
  33: "#C0392B",
  35: "#AD1457",
  36: "#4A90E2",
  40: "#F2C200",
  43: "#00A651",
  44: "#2A4D9B",
  45: "#0A84D6",
  50: "#8E24AA",
  55: "#F5A623",
  65: "#A50F15",
  70: "#00A3AD",
  77: "#FF8C00",
  80: "#7B1F1F",
  90: "#F57C00",
};

/** Color by party or candidate number (the first two digits are the party). */
export const colorByNumber = (n: number) => {
  let p = Math.abs(Math.floor(n));
  while (p >= 100) p = Math.floor(p / 10);
  return PARTY_COLORS[p] ?? colorByIndex(p);
};

export const STATUS_COLORS: Record<string, string> = {
  not_received: "#64748B",
  partial: "#F5A524",
  tallied: "#22C55E",
};

export const STATUS_LABELS: Record<string, string> = {
  not_received: "Não recebido",
  partial: "Parcial",
  tallied: "100% apurado",
};

export interface SituationStyle {
  label: string;
  color: string; // cor mantine
  variant: "filled" | "outline" | "light";
  description: string;
}

export const SITUATION_STYLES: Record<CandidateStatus, SituationStyle> = {
  ELECTED: {
    label: "Eleito",
    color: "green",
    variant: "filled",
    description: "Situação publicada pelo TSE: eleito.",
  },
  RUNOFF: {
    label: "2º turno",
    color: "yellow",
    variant: "filled",
    description: "Situação publicada pelo TSE: vai ao 2º turno.",
  },
  MATHEMATICALLY_ELECTED: {
    label: "Matematicamente eleito",
    color: "green",
    variant: "outline",
    description: "Definição matemática antes de 100% das seções apuradas (indicada pelo TSE).",
  },
  LEADING: {
    label: "Liderando",
    color: "blue",
    variant: "filled",
    description: "Calculado pelo painel: lidera a apuração em andamento. Não é declaração de eleito.",
  },
  SUBSTITUTE: {
    label: "Suplente",
    color: "gray",
    variant: "filled",
    description: "Situação publicada pelo TSE: suplente.",
  },
  NOT_ELECTED: {
    label: "Não eleito",
    color: "gray",
    variant: "light",
    description: "Situação publicada pelo TSE após a totalização.",
  },
  SUB_JUDICE: {
    label: "Sub judice",
    color: "red",
    variant: "outline",
    description: 'Destinação dos votos diferente de "Válido" (sub judice ou anulado).',
  },
  COUNTING: {
    label: "Em apuração",
    color: "gray",
    variant: "outline",
    description: "Apuração em andamento.",
  },
};

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

type RGB = [number, number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function interp(stops: RGB[], t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [Math.round(lerp(a[0], b[0], f)), Math.round(lerp(a[1], b[1], f)), Math.round(lerp(a[2], b[2], f))];
}

/** Sequential scale (deep blue → cyan → light yellow), readable on dark and light backgrounds. */
const SEQ: RGB[] = [
  [30, 42, 90],
  [37, 87, 168],
  [24, 144, 191],
  [52, 196, 170],
  [168, 222, 110],
  [250, 235, 120],
];
export const sequentialColor = (t: number): RGB => interp(SEQ, t);

/** Diverging scale: A (blue) ← neutral → B (orange). t in [-1, 1]. */
const DIV_NEG: RGB[] = [
  [230, 232, 238],
  [120, 160, 240],
  [37, 87, 220],
];
const DIV_POS: RGB[] = [
  [230, 232, 238],
  [245, 170, 100],
  [215, 90, 20],
];
export function divergingColor(t: number, corA?: string, corB?: string): RGB {
  const v = Math.max(-1, Math.min(1, t));
  if (corA && corB) {
    const neutro: RGB = [200, 204, 214];
    const alvo = v >= 0 ? hexToRgb(corA) : hexToRgb(corB);
    return interp([neutro, alvo], Math.abs(v));
  }
  return v >= 0 ? interp(DIV_NEG, v) : interp(DIV_POS, -v);
}

/** 5 bands of winning margin (p.p.) mapped to opacity. */
export const MARGIN_BANDS = [
  { upTo: 2, alpha: 0.35, label: "< 2 p.p." },
  { upTo: 5, alpha: 0.5, label: "2–5 p.p." },
  { upTo: 10, alpha: 0.66, label: "5–10 p.p." },
  { upTo: 20, alpha: 0.82, label: "10–20 p.p." },
  { upTo: Infinity, alpha: 0.97, label: "≥ 20 p.p." },
];
export function marginAlpha(m: number | null | undefined): number {
  if (m === null || m === undefined || !Number.isFinite(m)) return 0.35;
  for (const f of MARGIN_BANDS) if (m < f.upTo) return f.alpha;
  return 0.97;
}

export const cssGradient = (fn: (t: number) => RGB, n = 8) =>
  `linear-gradient(90deg, ${Array.from({ length: n }, (_, i) => {
    const [r, g, b] = fn(i / (n - 1));
    return `rgb(${r},${g},${b}) ${Math.round((i / (n - 1)) * 100)}%`;
  }).join(", ")})`;
