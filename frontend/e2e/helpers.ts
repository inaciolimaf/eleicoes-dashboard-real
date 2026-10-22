import { expect, type Page } from "@playwright/test";

export const API_URL = process.env.API_URL ?? "http://localhost:8000";
export const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
export const E2E_SENHA = process.env.E2E_SENHA ?? "";

/** Title of the generic error screen (`ErrorView` in `src/components/States.tsx`). */
export const ERROR_SCREEN_TITLE = "Não foi possível carregar";

/**
 * Every screen of the router. `pattern` is the route as declared in `src/App.tsx` (the test in
 * `tests/e2e-routes-list.test.ts` compares the two lists); `path` is the URL the routes project
 * opens, with fake ids where the screen needs one.
 */
export const ROUTES: { pattern: string; path: string }[] = [
  { pattern: "/", path: "/" },
  { pattern: "/p/:token", path: "/p/x" },
  { pattern: "/tv", path: "/tv" },
  { pattern: "/paineis", path: "/paineis" },
  { pattern: "/paineis/:id", path: "/paineis/1" },
  { pattern: "/explorar", path: "/explorar" },
  { pattern: "/explorar/:nivel", path: "/explorar/uf" },
  { pattern: "/explorar/:nivel/:id", path: "/explorar/uf/sp" },
  { pattern: "/mapas", path: "/mapas" },
  { pattern: "/locais/:id", path: "/locais/x" },
  { pattern: "/secoes/:id", path: "/secoes/x" },
  { pattern: "/secoes/:uf/:mun/:zona/:secao", path: "/secoes/sp/0/0/0" },
  { pattern: "/candidatos", path: "/candidatos" },
  { pattern: "/candidatos/:sqcand", path: "/candidatos/0" },
  { pattern: "/eventos", path: "/eventos" },
  { pattern: "/alertas", path: "/alertas" },
  { pattern: "/conta", path: "/conta" },
  { pattern: "/entrar", path: "/entrar" },
  { pattern: "/admin", path: "/admin" },
  { pattern: "*", path: "/rota-que-nao-existe" },
];

/** Opens a route and fails on an uncaught error, the error screen or an empty `#root`. */
export async function abrirRota(page: Page, path: string): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(page.getByText(ERROR_SCREEN_TITLE)).toHaveCount(0);
  expect(errors, `page errors in ${path}`).toEqual([]);
}

/** Logs in through the form at `/conta`, the way the user does. */
export async function entrarPeloFormulario(page: Page): Promise<void> {
  if (!E2E_EMAIL || !E2E_SENHA) throw new Error("Defina E2E_EMAIL e E2E_SENHA para os flows.");
  await page.goto("/conta");
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("E-mail").fill(E2E_EMAIL);
  await dialogo.getByLabel("Senha").fill(E2E_SENHA);
  await dialogo.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Menu do usuário" })).toBeVisible();
}
