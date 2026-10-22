import { test } from "@playwright/test";
import { abrirRota, ROUTES } from "./helpers";

for (const rota of ROUTES) {
  test(`abre ${rota.pattern} sem erro`, async ({ page }) => {
    await abrirRota(page, rota.path);
  });
}
