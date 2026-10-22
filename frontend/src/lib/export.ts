import { toPng } from "html-to-image";
import { notifications } from "@mantine/notifications";
import { BASE, qs } from "../api/client";
import type { Level } from "../api/models";
import { slug } from "./formatting";
import { DARK_BACKGROUND } from "./palettes";

export function downloadUrl(url: string, nome?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (nome) a.download = nome;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Downloads data from /exports (CSV or JSON): the results of an area, or its children. */
export function exportData(
  kind: "resultados" | "filhos",
  format: "csv" | "json",
  p: { turno: number; cargo: number; nivel: Level; id: string; t: string | null; filhos?: Level | null },
) {
  const url = `${BASE}/exports${qs({
    resource: kind === "resultados" ? "results" : "children",
    format,
    round: p.turno,
    office: p.cargo,
    level: p.nivel,
    id: p.id,
    at: p.t,
    child_level: p.filhos ?? undefined,
  })}`;
  downloadUrl(url, `${kind}-${p.nivel}-${p.id}-c${p.cargo}.${format}`);
}

export function downloadJson(obj: unknown, nome: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, nome);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Exports an element (a widget) as PNG. */
export async function exportarPng(el: HTMLElement | null, title: string) {
  if (!el) return;
  try {
    const background = getComputedStyle(document.body).backgroundColor || DARK_BACKGROUND;
    const dataUrl = await toPng(el, {
      backgroundColor: background,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      cacheBust: true,
      filter: (n) => !(n instanceof HTMLElement && n.dataset.exportIgnore === "true"),
    });
    downloadUrl(dataUrl, `${slug(title) || "widget"}.png`);
  } catch (e) {
    notifications.show({
      color: "red",
      title: "Falha ao exportar PNG",
      message: String((e as Error).message ?? e),
    });
  }
}
