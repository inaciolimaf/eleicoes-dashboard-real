import { toPng } from "html-to-image";
import { notifications } from "@mantine/notifications";
import { urlApi } from "../api/client";
import type { Nivel } from "../api/types";
import { slug } from "./format";

export function baixarUrl(url: string, nome?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (nome) a.download = nome;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Exporta dados via /export (CSV ou JSON). */
export function exportarDados(
  recurso: "resultados" | "filhos",
  formato: "csv" | "json",
  p: { turno: number; cargo: number; nivel: Nivel; id: string; t: string | null; filhos?: Nivel | null },
) {
  const url = urlApi("/export", {
    recurso,
    formato,
    turno: p.turno,
    cargo: p.cargo,
    nivel: p.nivel,
    id: p.id,
    t: p.t,
    filhos: p.filhos ?? undefined,
  });
  baixarUrl(url, `${recurso}-${p.nivel}-${p.id}-c${p.cargo}.${formato}`);
}

export function baixarJson(obj: unknown, nome: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  baixarUrl(url, nome);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Exporta um elemento (widget) como PNG. */
export async function exportarPng(el: HTMLElement | null, titulo: string) {
  if (!el) return;
  try {
    const fundo = getComputedStyle(document.body).backgroundColor || "#0B1220";
    const dataUrl = await toPng(el, {
      backgroundColor: fundo,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      cacheBust: true,
      filter: (n) => !(n instanceof HTMLElement && n.dataset.exportIgnore === "true"),
    });
    baixarUrl(dataUrl, `${slug(titulo) || "widget"}.png`);
  } catch (e) {
    notifications.show({ color: "red", title: "Falha ao exportar PNG", message: String((e as Error).message ?? e) });
  }
}
