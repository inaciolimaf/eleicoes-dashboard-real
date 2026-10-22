import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

configure({ asyncUtilTimeout: 4000 });

// maplibre-gl creates a worker blob URL when it is imported; jsdom has no createObjectURL.
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:test";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
