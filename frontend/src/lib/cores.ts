import type { Situacao, StatusApuracao } from "../api/types";

/** Paleta categórica neutra de 12 cores (sem associação ideológica), boa separação em dark/light. */
export const PALETA = [
  "#3D7BFF", "#F5A524", "#14B8A6", "#E5484D", "#8B5CF6", "#84CC16",
  "#EC4899", "#06B6D4", "#F97316", "#A3A3A3", "#6366F1", "#EAB308",
];

export const corPorIndice = (i: number) => PALETA[((i % PALETA.length) + PALETA.length) % PALETA.length];
/** Cor tradicional de cada partido, pelo número (mesma tabela do backend). */
export const COR_PARTIDO: Record<number, string> = {
  10: "#1F6FB2", 11: "#5DA9E9", 12: "#E4572E", 13: "#D7191C", 14: "#2E7D32", 15: "#2E9E48", 16: "#B71C1C",
  18: "#F28C28", 19: "#22B14C", 20: "#1B7F3A", 21: "#C62828", 22: "#0B3D91", 23: "#E6007E", 25: "#1E4FA0",
  27: "#7CB342", 28: "#00897B", 29: "#8E0000", 30: "#F26522", 33: "#C0392B", 35: "#AD1457", 36: "#4A90E2",
  40: "#F2C200", 43: "#00A651", 44: "#2A4D9B", 45: "#0A84D6", 50: "#8E24AA", 55: "#F5A623", 65: "#A50F15",
  70: "#00A3AD", 77: "#FF8C00", 80: "#7B1F1F", 90: "#F57C00",
};

/** Cor pelo número do partido ou do candidato (os 2 primeiros dígitos são o partido). */
export const corPorNumero = (n: number) => {
  let p = Math.abs(Math.floor(n));
  while (p >= 100) p = Math.floor(p / 10);
  return COR_PARTIDO[p] ?? corPorIndice(p);
};

export const COR_STATUS: Record<StatusApuracao, string> = {
  nao_recebido: "#64748B",
  parcial: "#F5A524",
  apurado: "#22C55E",
};

export const ROTULO_STATUS: Record<StatusApuracao, string> = {
  nao_recebido: "Não recebido",
  parcial: "Parcial",
  apurado: "100% apurado",
};

export interface EstiloSituacao {
  rotulo: string;
  cor: string; // cor mantine
  variante: "filled" | "outline" | "light";
  descricao: string;
}

export const SITUACAO: Record<Situacao, EstiloSituacao> = {
  ELEITO: { rotulo: "Eleito", cor: "green", variante: "filled", descricao: "Situação publicada pelo TSE: eleito." },
  SEGUNDO_TURNO: { rotulo: "2º turno", cor: "yellow", variante: "filled", descricao: "Situação publicada pelo TSE: vai ao 2º turno." },
  MATEMATICAMENTE_ELEITO: {
    rotulo: "Matematicamente eleito",
    cor: "green",
    variante: "outline",
    descricao: "Definição matemática antes de 100% das seções apuradas (indicada pelo TSE).",
  },
  LIDERANDO: {
    rotulo: "Liderando",
    cor: "blue",
    variante: "filled",
    descricao: "Calculado pelo painel: lidera a apuração em andamento. Não é declaração de eleito.",
  },
  SUPLENTE: { rotulo: "Suplente", cor: "gray", variante: "filled", descricao: "Situação publicada pelo TSE: suplente." },
  NAO_ELEITO: { rotulo: "Não eleito", cor: "gray", variante: "light", descricao: "Situação publicada pelo TSE após a totalização." },
  SUB_JUDICE: {
    rotulo: "Sub judice",
    cor: "red",
    variante: "outline",
    descricao: "Destinação dos votos diferente de \"Válido\" (sub judice ou anulado).",
  },
  EM_APURACAO: { rotulo: "Em apuração", cor: "gray", variante: "outline", descricao: "Apuração em andamento." },
};

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
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

/** Sequencial (azul profundo → ciano → amarelo claro), legível em fundo escuro e claro. */
const SEQ: RGB[] = [
  [30, 42, 90], [37, 87, 168], [24, 144, 191], [52, 196, 170], [168, 222, 110], [250, 235, 120],
];
export const corSequencial = (t: number): RGB => interp(SEQ, t);

/** Divergente: A (azul) ← neutro → B (laranja). t em [-1, 1]. */
const DIV_NEG: RGB[] = [[230, 232, 238], [120, 160, 240], [37, 87, 220]];
const DIV_POS: RGB[] = [[230, 232, 238], [245, 170, 100], [215, 90, 20]];
export function corDivergente(t: number, corA?: string, corB?: string): RGB {
  const v = Math.max(-1, Math.min(1, t));
  if (corA && corB) {
    const neutro: RGB = [200, 204, 214];
    const alvo = v >= 0 ? hexToRgb(corA) : hexToRgb(corB);
    return interp([neutro, alvo], Math.abs(v));
  }
  return v >= 0 ? interp(DIV_NEG, v) : interp(DIV_POS, -v);
}

/** 5 faixas de margem (p.p.) → opacidade */
export const FAIXAS_MARGEM = [
  { ate: 2, alpha: 0.35, rotulo: "< 2 p.p." },
  { ate: 5, alpha: 0.5, rotulo: "2–5 p.p." },
  { ate: 10, alpha: 0.66, rotulo: "5–10 p.p." },
  { ate: 20, alpha: 0.82, rotulo: "10–20 p.p." },
  { ate: Infinity, alpha: 0.97, rotulo: "≥ 20 p.p." },
];
export function alphaMargem(m: number | null | undefined): number {
  if (m === null || m === undefined || !Number.isFinite(m)) return 0.35;
  for (const f of FAIXAS_MARGEM) if (m < f.ate) return f.alpha;
  return 0.97;
}

export const gradienteCss = (fn: (t: number) => RGB, n = 8) =>
  `linear-gradient(90deg, ${Array.from({ length: n }, (_, i) => {
    const [r, g, b] = fn(i / (n - 1));
    return `rgb(${r},${g},${b}) ${Math.round((i / (n - 1)) * 100)}%`;
  }).join(", ")})`;
