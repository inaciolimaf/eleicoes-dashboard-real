const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nfPct2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfPct1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

const isFiniteNumber = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);

export const fmtInt = (n: number | null | undefined) => (isFiniteNumber(n) ? nfInt.format(n) : "—");
export const fmtPct = (n: number | null | undefined, decimals: 1 | 2 = 2) =>
  isFiniteNumber(n) ? `${(decimals === 1 ? nfPct1 : nfPct2).format(n)}%` : "—";
export const fmtPP = (n: number | null | undefined) => (isFiniteNumber(n) ? `${nfPct2.format(n)} p.p.` : "—");
export const fmtCompact = (n: number | null | undefined) => (isFiniteNumber(n) ? nfCompact.format(n) : "—");
export const fmtNum = (n: number | null | undefined, decimals = 2) =>
  isFiniteNumber(n) ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: decimals }).format(n) : "—";

/** Two-letter avatar text from a name: first and last word (or the first two letters of a single word). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** URL-safe lowercase id from a text, without accents. */
export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
