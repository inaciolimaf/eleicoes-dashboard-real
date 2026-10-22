import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { readdirSync } from "node:fs";

// Reuse rules: what already has a helper or token is not written by hand again.
// Each group is allowed in the one file that implements it (see `syntax` below).
const HEX = "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})";
const REUSE = {
  color: {
    selector: `Literal[value=/^${HEX}$/], TemplateElement[value.raw=/^${HEX}$/]`,
    message: "Use a color token or a palette from src/lib/palettes.ts instead of a hex literal.",
  },
  number: {
    selector: "CallExpression[callee.property.name='toLocaleString']",
    message:
      "Use fmtInt, fmtPct, fmtPP, fmtCompact or fmtNum from src/lib/formatting.ts instead of toLocaleString.",
  },
};

/** The reuse rules for `src/`, minus the group(s) the file implements. */
function syntax(...allowed) {
  return [
    "error",
    ...Object.entries(REUSE)
      .filter(([group]) => !allowed.includes(group))
      .map(([, rule]) => rule),
  ];
}

// Module boundaries: a module is imported only through its index.ts, and components/, lib/ and
// api/ (shared by every module) never import a module.
const MODULES = readdirSync(new URL("./src/modules", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const MODULE_MESSAGE = "Import a module only through its index.ts (src/modules/<domain>).";
const MODULE_IMPORTS = [
  { regex: "(^|/)modules/[^/]+/(?!index(\\.tsx?)?$)", message: MODULE_MESSAGE },
  { regex: `^(\\.\\./)+(${MODULES.join("|")})/(?!index(\\.tsx?)?$)`, message: MODULE_MESSAGE },
];
const SHARED_IMPORTS = [
  {
    regex: "(^|/)modules(/|$)",
    message: "components/, lib/ and api/ are shared: they do not import a module.",
  },
];

// TEMPORARY (refactoring of 2026-10-22): files that do not comply with the new rules yet. To check a file: ESLINT_STRICT=1 npx eslint <file>.
const PENDING = [
  "src/modules/charts/components/Donut.tsx",
  "src/modules/charts/components/EChart.tsx",
  "src/modules/charts/components/Evolution.tsx",
  "src/modules/charts/components/Hemicycle.tsx",
  "src/modules/charts/components/ProgressHeatmap.tsx",
  "src/modules/shell/components/FilterBar.tsx",
  "src/modules/shell/components/Navbar.tsx",
  "src/modules/shell/components/TimeSlider.tsx",
  "src/modules/polling-places/components/PollingPlaceDetail.tsx",
  "src/modules/maps/components/Legend.tsx",
  "src/modules/maps/components/ElectoralMapView.tsx",
  "src/modules/results/components/TotalsBlock.tsx",
  "src/modules/results/components/CandidateCard.tsx",
  "src/modules/results/components/Scoreboard.tsx",
  "src/modules/sections/components/SectionDetail.tsx",
  "src/modules/results/components/GeoAreaTable.tsx",
  "src/lib/export.ts",
  "src/lib/useColor.ts",
  "src/modules/admin/components/AdminScreen.tsx",
  "src/modules/alerts/components/AlertsScreen.tsx",
  "src/modules/results/components/CandidateScreen.tsx",
  "src/modules/results/components/CandidatesScreen.tsx",
  "src/modules/results/components/ExploreScreen.tsx",
  "src/modules/maps/components/MapsScreen.tsx",
  "src/modules/dashboards/components/DashboardsScreen.tsx",
  "src/modules/dashboards/components/TvScreen.tsx",
  "src/modules/dashboards/components/ShareModal.tsx",
  "src/modules/dashboards/components/ConfigDrawer.tsx",
  "src/modules/dashboards/components/WidgetDrawer.tsx",
  "src/modules/dashboards/components/NewDashboardModal.tsx",
  "src/modules/dashboards/components/DashboardView.tsx",
  "src/modules/dashboards/repo.ts",
  "src/modules/realtime/apply.ts",
  "src/modules/dashboards/widgets/components.tsx",
  "src/modules/dashboards/widgets/registry.tsx",
];
const STRICT = process.env.ESLINT_STRICT === "1";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "public",
      "src/api/types.ts",
      "coverage",
      "playwright-report",
      "test-results",
      "captures",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "max-lines-per-function": ["error", { max: 100, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "no-restricted-syntax": syntax(),
      "no-restricted-imports": ["error", { patterns: MODULE_IMPORTS }],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}", "src/api/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: SHARED_IMPORTS }] },
  },
  { files: ["src/lib/palettes.ts", "src/theme.ts"], rules: { "no-restricted-syntax": syntax("color") } },
  { files: ["src/lib/formatting.ts"], rules: { "no-restricted-syntax": syntax("number") } },
  ...(STRICT || PENDING.length === 0
    ? []
    : [
        {
          files: PENDING,
          rules: { "max-lines-per-function": "off", "max-lines": "off", "no-restricted-syntax": "off" },
        },
      ]),
  prettier,
);
