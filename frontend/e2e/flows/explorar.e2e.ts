import { expect, test } from "@playwright/test";

test("explore opens the first available state", async ({ page }) => {
  await page.goto("/explorar");
  // With a national result the states are rows of the table; without one, the screen offers one
  // button per state (the uppercase abbreviation).
  const firstRow = page.getByRole("rowgroup").nth(1).getByRole("row").first();
  const firstStateButton = page.getByRole("button", { name: /^[A-Z]{2}$/ }).first();
  await expect(firstRow.or(firstStateButton).first()).toBeVisible();
  await ((await firstRow.isVisible()) ? firstRow : firstStateButton).click();
  await expect(page).toHaveURL(/\/explorar\/uf\/[a-z]{2}$/);
});
