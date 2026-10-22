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
export const ROUTES: { pattern: string; path: string; missingId?: boolean }[] = [
  { pattern: "/", path: "/" },
  { pattern: "/p/:token", path: "/p/x" },
  { pattern: "/tv", path: "/tv" },
  { pattern: "/paineis", path: "/paineis" },
  { pattern: "/paineis/:id", path: "/paineis/1" },
  { pattern: "/explorar", path: "/explorar" },
  { pattern: "/explorar/:nivel", path: "/explorar/uf" },
  { pattern: "/explorar/:nivel/:id", path: "/explorar/uf/sp" },
  { pattern: "/mapas", path: "/mapas" },
  { pattern: "/locais/:id", path: "/locais/x", missingId: true },
  { pattern: "/secoes/:id", path: "/secoes/sp00000-z0000-s0000", missingId: true },
  { pattern: "/secoes/:uf/:mun/:zona/:secao", path: "/secoes/sp/00000/0000/0000", missingId: true },
  { pattern: "/candidatos", path: "/candidatos" },
  { pattern: "/candidatos/:sqcand", path: "/candidatos/0" },
  { pattern: "/eventos", path: "/eventos" },
  { pattern: "/alertas", path: "/alertas" },
  { pattern: "/conta", path: "/conta" },
  { pattern: "/entrar", path: "/entrar" },
  { pattern: "/admin", path: "/admin" },
  { pattern: "*", path: "/rota-que-nao-existe" },
];

/** Text of the API's 404 `detail` for a record that does not exist ("... não encontrado"). */
const NOT_FOUND_DETAIL = /não encontrad/i;

/**
 * Opens a route and fails on an uncaught error, an empty `#root` or the error screen. A route opened
 * with an id that does not exist (`missingId`) may show the error screen, but only with the API's
 * "not found" detail.
 */
export async function openRoute(page: Page, path: string, missingId = false): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator("#root")).not.toBeEmpty();
  if (missingId) await expect(page.getByText(NOT_FOUND_DETAIL).first()).toBeVisible();
  else await expect(page.getByText(ERROR_SCREEN_TITLE)).toHaveCount(0);
  expect(errors, `page errors in ${path}`).toEqual([]);
}

/** Logs in through the form at `/conta`, the way the user does. */
export async function signInThroughForm(page: Page): Promise<void> {
  if (!E2E_EMAIL || !E2E_SENHA) throw new Error("Set E2E_EMAIL and E2E_SENHA to run the flows.");
  await page.goto("/conta");
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-mail").fill(E2E_EMAIL);
  await dialog.getByLabel("Senha").fill(E2E_SENHA);
  await dialog.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Menu do usuário" })).toBeVisible();
}
