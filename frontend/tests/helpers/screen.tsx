import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { vi } from "vitest";
import { routes, routerFuture } from "../../src/App";
import { AppProviders } from "../../src/AppProviders";
import { CANDIDATES, EMPTY_TIMELINE, ELECTIONS, liveStatus } from "./data-shell";

export interface ApiCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

/** An answer that fails: `fakeApi` replies with this status and `body` (see `problem`). */
export interface FailedAnswer {
  status: number;
  body: unknown;
}

type Answer = unknown | ((call: ApiCall) => unknown) | FailedAnswer;

/** A problem body (RFC 7807) for a failed answer. */
export function problem(status: number, detail: string) {
  return { type: "test/failure", title: "Erro", status, detail };
}

function isFailedAnswer(answer: unknown): answer is FailedAnswer {
  return (
    typeof answer === "object" &&
    answer !== null &&
    Object.keys(answer).length === 2 &&
    "status" in answer &&
    "body" in answer &&
    typeof answer.status === "number"
  );
}

/** Answers that every screen gets unless the test overrides them (the shell asks for these). */
const SHELL_ANSWERS: Record<string, Answer> = {
  "GET /status": liveStatus(),
  "GET /elections": ELECTIONS,
  "GET /timeline": EMPTY_TIMELINE,
  "GET /dashboards": [],
  "GET /candidates": CANDIDATES,
  "GET /favorites": [],
  "GET /preferences": {},
  "GET /alerts": [],
  "GET /events": [],
};

/**
 * Swaps `fetch` for a fake API: keys are `"METHOD /path"` without `/api/v1`
 * (e.g. `"GET /candidates/123"`). An undeclared route answers 404 `problem+json` naming the
 * route, so the test fails saying what was missing.
 */
export function fakeApi(answers: Record<string, Answer>) {
  const all = { ...SHELL_ANSWERS, ...answers };
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const call = { method, path, query: url.searchParams, body };
      calls.push(call);
      const key = `${method} ${path}`;
      if (!(key in all)) {
        const missing = { type: "test/undeclared", title: "Rota não declarada", status: 404, detail: key };
        return new Response(JSON.stringify(missing), {
          status: 404,
          headers: { "content-type": "application/problem+json" },
        });
      }
      const answer = all[key];
      if (isFailedAnswer(answer)) {
        return new Response(JSON.stringify(answer.body), {
          status: answer.status,
          headers: { "content-type": "application/problem+json" },
        });
      }
      const data = typeof answer === "function" ? (answer as (c: ApiCall) => unknown)(call) : answer;
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return { calls: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key) };
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(): void {}
  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

/** What jsdom lacks and Mantine/maps use. */
function fillJsdom(): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("WebSocket", FakeWebSocket);
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
}

/** Renders the real router at `url` (screen URLs stay in Portuguese, e.g. `/candidatos/123`). */
export async function renderScreen(url: string): Promise<RenderResult & { user: UserEvent }> {
  fillJsdom();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [url], future: routerFuture });
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={client}>
      <AppProviders>
        <Suspense fallback={null}>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </Suspense>
      </AppProviders>
    </QueryClientProvider>,
  );
  return { ...result, user };
}
