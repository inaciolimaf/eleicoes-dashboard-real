/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_PROXY || "http://localhost:8000";
const apiE2e = process.env.API_URL || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // `vite preview` serves the production build for Playwright (e2e/); the API is the real one.
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": { target: apiE2e, changeOrigin: true, ws: true },
      "/health": { target: apiE2e, changeOrigin: true },
    },
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // helpers do Vite/Rollup ficam num chunk próprio (senão podem cair dentro do chunk do mapa e forçar o download dele)
          if (id.includes("preload-helper") || id.includes("commonjsHelpers")) return "helpers";
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("maplibre-gl") || id.includes("react-map-gl")) return "maplibre";
          if (
            id.includes("@deck.gl") ||
            id.includes("@luma.gl") ||
            id.includes("@math.gl") ||
            id.includes("@loaders.gl") ||
            id.includes("@probe.gl")
          )
            return "deckgl";
          if (id.includes("echarts") || id.includes("zrender")) return "echarts";
          if (id.includes("@mantine")) return "mantine";
          if (id.includes("@tabler")) return "icons";
          if (
            id.includes("react-grid-layout") ||
            id.includes("react-resizable") ||
            id.includes("react-draggable")
          )
            return "grid";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    css: false,
    setupFiles: ["tests/setup.ts"],
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/api/types.ts", "src/main.tsx"],
      thresholds: { lines: 60, statements: 60, functions: 60, branches: 60 },
    },
  },
});
