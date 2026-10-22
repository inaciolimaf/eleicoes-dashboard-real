import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Role queries on the large screens (maps, dashboards) take seconds while the whole suite runs in
// parallel under coverage; the wait lives here, not in each test.
configure({ asyncUtilTimeout: 8000 });

// maplibre-gl creates a worker blob URL when it is imported; jsdom has no createObjectURL.
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:test";

// react-router's data router builds a `Request` with jsdom's AbortSignal, which Node's `Request`
// rejects ("Expected signal to be an instance of AbortSignal"): navigating in a test would fail.
// The tests never abort a navigation, so the signal is dropped.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const { signal: _signal, ...rest } = init ?? {};
    super(input, rest);
  }
} as typeof Request;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
