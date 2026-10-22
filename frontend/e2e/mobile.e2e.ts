import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { openRoute, ROUTES } from "./helpers";

const CAPTURES = resolve(process.cwd(), "captures");

for (const route of ROUTES) {
  test(`${route.pattern} fits 390x844 without horizontal scroll`, async ({ page }) => {
    await openRoute(page, route.path, route.missingId);
    mkdirSync(CAPTURES, { recursive: true });
    const name = route.path.replace(/^\//, "").replace(/[/:]/g, "_") || "home";
    await page.screenshot({ path: resolve(CAPTURES, `${name}.png`), fullPage: true });
    const size = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(size.width, `scrollWidth of ${route.path}`).toBeLessThanOrEqual(size.viewport);
  });
}
