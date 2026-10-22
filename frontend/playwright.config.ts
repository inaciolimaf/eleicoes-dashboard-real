import { defineConfig } from "@playwright/test";

const PORTA = 4173;
const BASE_URL = `http://localhost:${PORTA}`;

/**
 * Runs on the production build (`npm run build` first): `vite preview` proxies `/api` and `/health`
 * to the real API (`API_URL`). System Chrome, not a downloaded browser.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: /\.e2e\.ts$/,
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx vite preview --port ${PORTA} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "setup", testDir: "e2e", testMatch: /setup\.e2e\.ts$/ },
    { name: "routes", testDir: "e2e", testMatch: /routes\.e2e\.ts$/ },
    {
      name: "mobile",
      testDir: "e2e",
      testMatch: /mobile\.e2e\.ts$/,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: "flows",
      testDir: "e2e/flows",
      dependencies: ["setup"],
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
