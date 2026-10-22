import { expect, test } from "@playwright/test";
import { API_URL, E2E_EMAIL, E2E_SENHA } from "./helpers";

/** Creates the e2e account through the API when it does not exist yet (the flows log in with it). */
test("conta de e2e existe na API", async ({ request }) => {
  test.skip(!E2E_EMAIL || !E2E_SENHA, "Defina E2E_EMAIL e E2E_SENHA");
  const entrada = { data: { email: E2E_EMAIL, password: E2E_SENHA } };
  const login = await request.post(`${API_URL}/api/v1/auth/login`, entrada);
  if (login.ok()) return;
  const registro = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { email: E2E_EMAIL, password: E2E_SENHA, name: "Conta E2E" },
  });
  expect(registro.status(), await registro.text()).toBe(201);
});
