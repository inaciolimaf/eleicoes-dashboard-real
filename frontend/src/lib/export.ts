import { toPng } from "html-to-image";
import { notifications } from "@mantine/notifications";
import { BASE, qs } from "../api/client";
import type { Level } from "../api/models";
import { slug } from "./formatting";

export function downloadUrl(url: string, nome?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (nome) a.download = nome;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Exporta dados via /export (CSV ou JSON). */
export function exportData(
  recurso: "resultados" | "filhos",
  formato: "csv" | "json",
  p: { turno: number; cargo: number; nivel: Level; id: string; t: string | null; filhos?: Level | null },
) {
  const url = `${BASE}/exports${qs({
    resource: recurso === "resultados" ? "results" : "children",
    format: formato,
    round: p.turno,
    office: p.cargo,
    level: p.nivel,
    id: p.id,
    at: p.t,
    child_level: p.filhos ?? undefined,
  })}`;
  downloadUrl(url, `${recurso}-${p.nivel}-${p.id}-c${p.cargo}.${formato}`);
}

export function downloadJson(obj: unknown, nome: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, nome);
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
    downloadUrl(dataUrl, `${slug(titulo) || "widget"}.png`);
  } catch (e) {
    notifications.show({
      color: "red",
      title: "Falha ao exportar PNG",
      message: String((e as Error).message ?? e),
    });
  }
}
