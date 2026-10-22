import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Reuse rules: what already has a helper or token is not written by hand again.
// Each group is allowed in the one file that implements it (see `syntax` below).
const HEX = "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})";
const REUSE = {
  color: {
    selector: `Literal[value=/^${HEX}$/], TemplateElement[value.raw=/^${HEX}$/]`,
    message: "Use a color token or a palette from src/lib/cores.ts instead of a hex literal.",
  },
  number: {
    selector: "CallExpression[callee.property.name='toLocaleString']",
    message:
      "Use fmtInt, fmtPct, fmtPP, fmtCompact or fmtNum from src/lib/format.ts instead of toLocaleString.",
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

// TEMPORARY (refactoring of 2026-10-22): files that do not comply with the new rules yet. To check a file: ESLINT_STRICT=1 npx eslint <file>.
const PENDING = [
  "src/api/hooks.ts",
  "src/components/graficos/EChart.tsx",
  "src/components/graficos/Evolucao.tsx",
  "src/components/graficos/HeatmapProgresso.tsx",
  "src/components/graficos/Hemiciclo.tsx",
  "src/components/graficos/Rosca.tsx",
  "src/components/layout/FilterBar.tsx",
  "src/components/layout/Navbar.tsx",
  "src/components/layout/TimeSlider.tsx",
  "src/components/locais/DetalheLocal.tsx",
  "src/components/mapas/Legenda.tsx",
  "src/components/mapas/MapaEleitoral.tsx",
  "src/components/resultados/BlocoTotais.tsx",
  "src/components/resultados/CardCandidato.tsx",
  "src/components/resultados/Placar.tsx",
  "src/components/secoes/DetalheSecao.tsx",
  "src/components/tabelas/TabelaRecortes.tsx",
  "src/lib/exportar.ts",
  "src/lib/useCor.ts",
  "src/pages/AdminPage.tsx",
  "src/pages/AlertasPage.tsx",
  "src/pages/CandidatoPage.tsx",
  "src/pages/CandidatosPage.tsx",
  "src/pages/ExplorarPage.tsx",
  "src/pages/MapasPage.tsx",
  "src/pages/PaineisPage.tsx",
  "src/pages/TvPage.tsx",
  "src/paineis/CompartilharModal.tsx",
  "src/paineis/GavetaConfig.tsx",
  "src/paineis/GavetaWidgets.tsx",
  "src/paineis/NovoPainelModal.tsx",
  "src/paineis/PainelView.tsx",
  "src/paineis/repo.ts",
  "src/realtime/aplicar.ts",
  "src/widgets/componentes.tsx",
  "src/widgets/registro.tsx",
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
    },
  },
  { files: ["src/lib/cores.ts", "src/theme.ts"], rules: { "no-restricted-syntax": syntax("color") } },
  { files: ["src/lib/format.ts"], rules: { "no-restricted-syntax": syntax("number") } },
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
