import { expect, test } from "@playwright/test";
import { API_URL, signInThroughForm } from "../helpers";

// A wrong login uses an e-mail without an account: the API answers the same message as for a wrong
// password, and the failures do not count toward the e2e account's attempt limit.
const UNKNOWN_EMAIL = `nobody-${Date.now()}@example.com`;

test("a wrong password shows the message the API returns", async ({ page, request }) => {
  const response = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: UNKNOWN_EMAIL, password: "wrong-password-e2e" },
  });
  expect(response.ok()).toBe(false);
  const { detail } = (await response.json()) as { detail: string };
  expect(detail).toBeTruthy();

  await page.goto("/conta");
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-mail").fill(UNKNOWN_EMAIL);
  await dialog.getByLabel("Senha").fill("wrong-password-e2e");
  await dialog.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(detail);
});

test("signs in through the form and signs out from the user menu", async ({ page }) => {
  await signInThroughForm(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu do usuário" })).toHaveCount(0);
});
