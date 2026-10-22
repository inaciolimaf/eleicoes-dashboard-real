import { expect, test } from "@playwright/test";

test("explorar abre o primeiro estado disponível", async ({ page }) => {
  await page.goto("/explorar");
  // Without a single national result, the screen offers one button per state (the uppercase abbreviation).
  const primeiraUf = page.getByRole("button", { name: /^[A-Z]{2}$/ }).first();
  await primeiraUf.click();
  await expect(page).toHaveURL(/\/explorar\/uf\/[a-z]{2}$/);
});
