/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_PROXY || "http://localhost:8000";

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
      // TEMPORARY: raised to 60 once the screen tests exist (standard: testing.md)
      thresholds: { lines: 0, statements: 0, functions: 0, branches: 0 },
    },
  },
});
