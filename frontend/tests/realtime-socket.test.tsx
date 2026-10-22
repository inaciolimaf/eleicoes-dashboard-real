import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WsServerMessage } from "../src/api/models";
import { qk } from "../src/api/query-keys";

/** A WebSocket the test drives by hand: it opens, receives and closes when told to. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  receive(payload: unknown) {
    this.onmessage?.({ data: typeof payload === "string" ? payload : JSON.stringify(payload) });
  }
}

const last = () => FakeSocket.instances[FakeSocket.instances.length - 1];

/**
 * Loads fresh copies of the socket and of the stores it reads: the live socket is a singleton per
 * module instance, and the stores must be the ones the socket subscribes to.
 */
async function freshSocket() {
  vi.resetModules();
  const { liveSocket } = await import("../src/modules/realtime/socket");
  const { useAuth } = await import("../src/lib/auth-store");
  const { useUi } = await import("../src/lib/ui-store");
  return { liveSocket, useAuth, useUi };
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live socket", () => {
  it("connects once to the WebSocket of the API and reports the state", async () => {
    const { liveSocket, useUi } = await freshSocket();
    const qc = new QueryClient();
    liveSocket.iniciar(qc);
    liveSocket.iniciar(qc);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(last().url).toMatch(/^wss?:\/\/.+\/api\/v1\/ws$/);
    expect(useUi.getState().wsEstado).toBe("conectando");
    last().open();
    expect(useUi.getState().wsEstado).toBe("aberto");
  });

  it("subscribes a topic once, however many components ask for it, and releases it at the last release", async () => {
    const { liveSocket } = await freshSocket();
    liveSocket.iniciar(new QueryClient());
    last().open();
    const releaseFirst = liveSocket.subscribe(["results:1:1:state:sp", "events:1"]);
    expect(last().sent).toEqual([{ op: "subscribe", topics: ["results:1:1:state:sp", "events:1"] }]);
    const releaseSecond = liveSocket.subscribe(["events:1"]);
    expect(last().sent).toHaveLength(1);
    releaseFirst();
    expect(last().sent.at(-1)).toEqual({ op: "unsubscribe", topics: ["results:1:1:state:sp"] });
    releaseSecond();
    expect(last().sent.at(-1)).toEqual({ op: "unsubscribe", topics: ["events:1"] });
  });

  it("sends the topics that are still wanted when the socket opens again", async () => {
    vi.useFakeTimers();
    const { liveSocket } = await freshSocket();
    liveSocket.iniciar(new QueryClient());
    last().open();
    liveSocket.subscribe(["status"]);
    last().close();
    vi.advanceTimersByTime(40_000);
    last().open();
    expect(last().sent[0]).toEqual({ op: "subscribe", topics: ["status"] });
  });

  it("delivers each server message to the listeners and to the cache, and keeps the sequence number", async () => {
    const { liveSocket } = await freshSocket();
    const qc = new QueryClient();
    liveSocket.iniciar(qc);
    last().open();
    const seen: WsServerMessage[] = [];
    const stop = liveSocket.listen((m) => seen.push(m));
    last().receive({ type: "status", seq: 7, data: { collector: "ok" } });
    last().receive("não é JSON");
    expect(seen).toHaveLength(1);
    expect(liveSocket.ultimoSeq).toBe(7);
    expect(qc.getQueryData(qk.status())).toEqual({ collector: "ok" });
    stop();
    last().receive({ type: "pong" });
    expect(seen).toHaveLength(1);
  });

  it("authenticates when the user logs in, and reconnects without the socket when the user logs out", async () => {
    vi.useFakeTimers();
    const { liveSocket, useAuth } = await freshSocket();
    liveSocket.iniciar(new QueryClient());
    last().open();
    useAuth
      .getState()
      .setSessao("tok-1", { id: "u1", email: "a@b.c", name: "Ana", is_admin: false } as never);
    expect(last().sent.at(-1)).toEqual({ op: "auth", token: "tok-1" });
    const before = FakeSocket.instances.length;
    useAuth.getState().sair();
    vi.advanceTimersByTime(100);
    // sockets of earlier test modules may reconnect too: the new one is at least there
    expect(FakeSocket.instances.length).toBeGreaterThan(before);
  });

  it("reconnects after the socket closes, and refetches what it may have missed", async () => {
    vi.useFakeTimers();
    const { liveSocket, useUi } = await freshSocket();
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    liveSocket.iniciar(qc);
    last().open();
    last().close();
    expect(useUi.getState().wsEstado).toBe("reconectando");
    vi.advanceTimersByTime(31_000);
    expect(FakeSocket.instances).toHaveLength(2);
    last().open();
    expect(useUi.getState().wsEstado).toBe("aberto");
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("closes a socket that errors, and retries when the connection cannot be created", async () => {
    vi.useFakeTimers();
    const { liveSocket } = await freshSocket();
    liveSocket.iniciar(new QueryClient());
    last().onerror?.();
    expect(last().readyState).toBe(FakeSocket.CLOSED);
    vi.advanceTimersByTime(31_000);
    expect(FakeSocket.instances).toHaveLength(2);

    class Broken {
      constructor() {
        throw new Error("sem rede");
      }
    }
    vi.stubGlobal("WebSocket", Object.assign(Broken, { OPEN: 1, CLOSED: 3 }));
    vi.resetModules();
    const fresh = await import("../src/modules/realtime/socket");
    expect(() => fresh.liveSocket.iniciar(new QueryClient())).not.toThrow();
  });

  it("reconnects at once when the page becomes visible with the socket closed", async () => {
    vi.useFakeTimers();
    const { liveSocket } = await freshSocket();
    liveSocket.iniciar(new QueryClient());
    last().open();
    last().readyState = FakeSocket.CLOSED;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const before = FakeSocket.instances.length;
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances.length).toBeGreaterThan(before);
  });
});

describe("useLive", () => {
  it("subscribes the topics while mounted, once per distinct topic, and releases them on unmount", async () => {
    vi.resetModules();
    const { liveSocket } = await import("../src/modules/realtime/socket");
    const { useLive } = await import("../src/modules/realtime/useLive");
    liveSocket.iniciar(new QueryClient());
    last().open();
    const { unmount } = renderHook(() => useLive(["events:1", null, false, "events:1", ""]));
    expect(last().sent).toEqual([{ op: "subscribe", topics: ["events:1"] }]);
    unmount();
    expect(last().sent.at(-1)).toEqual({ op: "unsubscribe", topics: ["events:1"] });
  });

  it("does nothing without topics", async () => {
    vi.resetModules();
    const { liveSocket } = await import("../src/modules/realtime/socket");
    const { useLive } = await import("../src/modules/realtime/useLive");
    liveSocket.iniciar(new QueryClient());
    last().open();
    renderHook(() => useLive([undefined, false]));
    expect(last().sent).toEqual([]);
  });
});
