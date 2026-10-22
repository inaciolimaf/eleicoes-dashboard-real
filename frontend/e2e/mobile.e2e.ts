import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { abrirRota, ROUTES } from "./helpers";

const CAPTURAS = resolve(process.cwd(), "captures");

for (const rota of ROUTES) {
  test(`${rota.pattern} cabe em 390x844 sem rolagem horizontal`, async ({ page }) => {
    await abrirRota(page, rota.path);
    mkdirSync(CAPTURAS, { recursive: true });
    const nome = rota.path.replace(/^\//, "").replace(/[/:]/g, "_") || "inicio";
    await page.screenshot({ path: resolve(CAPTURAS, `${nome}.png`), fullPage: true });
    const medidas = await page.evaluate(() => ({
      largura: document.documentElement.scrollWidth,
      janela: window.innerWidth,
    }));
    expect(medidas.largura, `scrollWidth de ${rota.path}`).toBeLessThanOrEqual(medidas.janela);
  });
}
