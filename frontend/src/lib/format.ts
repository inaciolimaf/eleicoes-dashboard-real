const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nfPct2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfPct1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

const ok = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

export const fmtInt = (n: number | null | undefined) => (ok(n) ? nfInt.format(n) : "—");
export const fmtPct = (n: number | null | undefined, casas: 1 | 2 = 2) =>
  ok(n) ? `${(casas === 1 ? nfPct1 : nfPct2).format(n)}%` : "—";
export const fmtPP = (n: number | null | undefined) => (ok(n) ? `${nfPct2.format(n)} p.p.` : "—");
export const fmtCompact = (n: number | null | undefined) => (ok(n) ? nfCompact.format(n) : "—");
export const fmtNum = (n: number | null | undefined, casas = 2) =>
  ok(n) ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(n) : "—";

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
