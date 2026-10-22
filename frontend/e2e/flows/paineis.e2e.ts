import { expect, test, type APIRequestContext } from "@playwright/test";
import { API_URL, E2E_EMAIL, E2E_SENHA, signInThroughForm } from "../helpers";

const NAME = `E2E ${Date.now()}`;

/** Removes the dashboards this flow named `E2E ...` (a failed run may leave them behind). */
async function deleteE2eDashboards(token: string, request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${token}` };
  const list = await request.get(`${API_URL}/api/v1/dashboards`, { headers: headers });
  const dashboards = (await list.json()) as { id: number; name: string }[];
  for (const dashboard of dashboards.filter((p) => p.name.startsWith("E2E "))) {
    await request.delete(`${API_URL}/api/v1/dashboards/${dashboard.id}`, { headers: headers });
  }
}

test("creates a blank dashboard and deletes it", async ({ page, request }) => {
  const session = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_SENHA },
  });
  const { access_token: token } = (await session.json()) as { access_token: string };
  try {
    await signInThroughForm(page);
    await page.goto("/paineis");
    await page.getByRole("button", { name: "Novo painel", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Painel em branco").click();
    await dialog.getByLabel("Nome do painel").fill(NAME);
    await dialog.getByRole("button", { name: "Criar painel" }).click();
    // Dashboard ids are UUIDs.
    await expect(page).toHaveURL(/\/paineis\/[0-9a-f-]{36}$/);
    await expect(page.getByText(NAME).first()).toBeVisible();

    await page.getByRole("button", { name: "Menu do painel" }).click();
    await page.getByRole("menuitem", { name: "Apagar painel" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apagar" }).click();
    await expect(page).toHaveURL(/\/paineis$/);
    await expect(page.getByText(NAME)).toHaveCount(0);
  } finally {
    await deleteE2eDashboards(token, request);
  }
});
