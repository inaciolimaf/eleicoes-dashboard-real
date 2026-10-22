import { expect, test } from "@playwright/test";

test("explorar abre o primeiro estado disponível", async ({ page }) => {
  await page.goto("/explorar");
  // Sem resultado nacional único, a tela oferece um botão por UF (a sigla em maiúsculas).
  const primeiraUf = page.getByRole("button", { name: /^[A-Z]{2}$/ }).first();
  await primeiraUf.click();
  await expect(page).toHaveURL(/\/explorar\/uf\/[a-z]{2}$/);
});
