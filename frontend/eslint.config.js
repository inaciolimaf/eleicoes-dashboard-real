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
    message:
      "Use a color token or a palette from src/lib/palettes.ts or src/lib/palettes/<module>.ts instead of a hex literal.",
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
  {
    files: ["src/lib/palettes.ts", "src/lib/palettes/*.ts", "src/theme.ts"],
    rules: { "no-restricted-syntax": syntax("color") },
  },
  { files: ["src/lib/formatting.ts"], rules: { "no-restricted-syntax": syntax("number") } },
  prettier,
);
