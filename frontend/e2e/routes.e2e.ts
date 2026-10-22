import { test } from "@playwright/test";
import { openRoute, ROUTES } from "./helpers";

for (const route of ROUTES) {
  test(`opens ${route.pattern} without errors`, async ({ page }) => {
    await openRoute(page, route.path, route.missingId);
  });
}
