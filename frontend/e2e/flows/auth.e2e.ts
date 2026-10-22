import { expect, test } from "@playwright/test";
import { API_URL, E2E_EMAIL, entrarPeloFormulario } from "../helpers";

test("senha errada mostra a mensagem que a API devolve", async ({ page, request }) => {
  const resposta = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: E2E_EMAIL, password: "senha-errada-e2e" },
  });
  expect(resposta.ok()).toBe(false);
  const { detail } = (await resposta.json()) as { detail: string };
  expect(detail).toBeTruthy();

  await page.goto("/conta");
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("E-mail").fill(E2E_EMAIL);
  await dialogo.getByLabel("Senha").fill("senha-errada-e2e");
  await dialogo.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(dialogo.getByRole("alert")).toContainText(detail);
});

test("entra pelo formulário e sai pelo menu do usuário", async ({ page }) => {
  await entrarPeloFormulario(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu do usuário" })).toHaveCount(0);
});
