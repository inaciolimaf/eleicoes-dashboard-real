import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBreadcrumb } from "../src/modules/shell/components/GeoCrumbs";
import {
  findAdjacentEvent,
  useBackToLive,
  useReplayClock,
  useTimelineEvents,
  type TimelineEventAt,
} from "../src/modules/shell/hooks";
import { useTime } from "../src/lib/time-store";
import { resetStores } from "./helpers/data-shell";

const BASE = Date.parse("2026-10-04T12:00:00Z");
const at = (minutes: number): TimelineEventAt => ({
  event: {
    id: minutes,
    type: "milestone",
    occurred_at: new Date(BASE + minutes * 60_000).toISOString(),
  } as never,
  ms: BASE + minutes * 60_000,
});

beforeEach(resetStores);
afterEach(() => {
  vi.useRealTimers();
});

describe("findAdjacentEvent", () => {
  const events = [at(10), at(20), at(30)];

  it("finds the next event after the instant, ignoring one a second away", () => {
    expect(findAdjacentEvent(events, BASE + 10 * 60_000 - 500, 1)?.ms).toBe(BASE + 20 * 60_000);
    expect(findAdjacentEvent(events, BASE + 10 * 60_000, 1)?.ms).toBe(BASE + 20 * 60_000);
  });

  it("finds the previous event before the instant", () => {
    expect(findAdjacentEvent(events, BASE + 25 * 60_000, -1)?.ms).toBe(BASE + 20 * 60_000);
    expect(findAdjacentEvent(events, BASE + 10 * 60_000, -1)).toBeUndefined();
  });

  it("finds nothing past the last event", () => {
    expect(findAdjacentEvent(events, BASE + 40 * 60_000, 1)).toBeUndefined();
  });
});

describe("useTimelineEvents", () => {
  it("keeps the events inside the window, in time order", () => {
    const timeline = {
      start: null,
      end: null,
      now: null,
      events: [
        { id: 2, type: "milestone", occurred_at: new Date(BASE + 30 * 60_000).toISOString() },
        { id: 1, type: "milestone", occurred_at: new Date(BASE + 10 * 60_000).toISOString() },
        { id: 3, type: "milestone", occurred_at: new Date(BASE + 90 * 60_000).toISOString() },
      ],
    };
    const { result } = renderHook(() => useTimelineEvents(timeline as never, BASE, BASE + 60 * 60_000));
    expect(result.current.map((item) => item.event.id)).toEqual([1, 2]);
  });

  it("returns nothing for an empty window", () => {
    const { result } = renderHook(() => useTimelineEvents(undefined, null, null));
    expect(result.current).toEqual([]);
  });
});

describe("useReplayClock", () => {
  it("moves the clock by the speed every two seconds and stops when paused", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    useTime.setState({ speed: 60 });
    const backToLive = vi.fn();
    const { rerender } = renderHook(
      ({ playing }) => useReplayClock(playing, BASE, BASE + 3600_000, backToLive),
      {
        initialProps: { playing: true },
      },
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(Date.parse(useTime.getState().t ?? "")).toBe(BASE + 60 * 2000);
    rerender({ playing: false });
    act(() => vi.advanceTimersByTime(10_000));
    expect(Date.parse(useTime.getState().t ?? "")).toBe(BASE + 60 * 2000);
    expect(backToLive).not.toHaveBeenCalled();
  });

  it("goes back to live when the replay reaches the end", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    useTime.setState({ speed: 300, t: new Date(BASE + 3599_000).toISOString() });
    const backToLive = vi.fn();
    renderHook(() => useReplayClock(true, BASE, BASE + 3600_000, backToLive));
    act(() => vi.advanceTimersByTime(2000));
    expect(backToLive).toHaveBeenCalledTimes(1);
  });
});

describe("useBackToLive", () => {
  it("returns to the live view and refetches the live numbers", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    useTime.setState({ t: new Date(BASE).toISOString() });
    const { result } = renderHook(() => useBackToLive(), { wrapper });
    act(() => result.current());
    expect(useTime.getState().t).toBeNull();
    expect(invalidate).toHaveBeenCalledTimes(1);
    const { predicate } = invalidate.mock.calls[0]?.[0] as unknown as {
      predicate: (q: { queryKey: unknown[] }) => boolean;
    };
    expect(predicate({ queryKey: ["resultados", 1, null] })).toBe(true);
    expect(predicate({ queryKey: ["resultados", 1, "2026-10-04T12:00:00Z"] })).toBe(false);
    expect(predicate({ queryKey: ["busca", null] })).toBe(false);
  });
});

describe("defaultBreadcrumb", () => {
  it("is only Brasil for the national scope", () => {
    expect(defaultBreadcrumb("country", "br").map((c) => c.name)).toEqual(["Brasil"]);
  });

  it("goes Brasil, the state and the area", () => {
    const trail = defaultBreadcrumb("municipality", "35503", "Campinas");
    expect(trail.map((c) => c.name)).toEqual(["Brasil", expect.any(String), "Campinas"]);
    expect(trail[1]?.id).toBe("35");
  });

  it("stops at the state for a state scope", () => {
    expect(defaultBreadcrumb("state", "35").map((c) => c.level)).toEqual(["country", "state"]);
  });
});
