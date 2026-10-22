import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { toPng } from "html-to-image";
import { notifications } from "@mantine/notifications";
import { exportPng, exportData, downloadJson } from "../src/lib/export";
import { FilterProvider, useEffectiveFilter, useFixedTime } from "../src/lib/effective-filter";
import { DEFAULT_FILTER, useFilter } from "../src/lib/filter-store";
import { useTime } from "../src/lib/time-store";
import { useCandidateColor } from "../src/lib/useColor";
import { usePrefs, DEFAULT_PREFS } from "../src/lib/prefs-store";
import { FALLBACK_CANDIDATE_COLOR, colorByNumber } from "../src/lib/palettes";
import { timeQueryOptions, useWsOpen } from "../src/api/query-keys";
import { useUi } from "../src/lib/ui-store";

vi.mock("html-to-image", () => ({ toPng: vi.fn() }));
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));

/** Records the links the export clicks instead of navigating. */
function recordDownloads() {
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  return clicked;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:json");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("exports", () => {
  it("downloads the results of an area as CSV, leaving out the empty parameters", () => {
    const clicked = recordDownloads();
    exportData("results", "csv", { turno: 1, cargo: 1, nivel: "state", id: "sp", t: null });
    expect(clicked[0].getAttribute("href")).toBe(
      "/api/v1/exports?resource=results&format=csv&round=1&office=1&level=state&id=sp",
    );
    expect(clicked[0].download).toBe("resultados-state-sp-c1.csv");
    expect(clicked[0].parentNode).toBeNull();
  });

  it("downloads the children as JSON, at the time T and with the child level", () => {
    const clicked = recordDownloads();
    exportData("children", "json", {
      turno: 2,
      cargo: 5,
      nivel: "country",
      id: "br",
      t: "2026-10-04T18:00:00Z",
      childLevel: "state",
    });
    const href = clicked[0].getAttribute("href") ?? "";
    expect(href).toContain("resource=children");
    expect(href).toContain("at=2026-10-04T18%3A00%3A00Z");
    expect(href).toContain("child_level=state");
    expect(clicked[0].download).toBe("filhos-country-br-c5.json");
  });

  it("downloads a JSON object through a blob and revokes the blob later", () => {
    vi.useFakeTimers();
    const clicked = recordDownloads();
    downloadJson({ a: 1 }, "painel.json");
    expect(clicked[0].getAttribute("href")).toBe("blob:json");
    expect(clicked[0].download).toBe("painel.json");
    vi.advanceTimersByTime(2000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:json");
  });

  it("does nothing when the element to export is missing", async () => {
    await exportPng(null, "Painel");
    expect(toPng).not.toHaveBeenCalled();
  });

  it("exports an element as PNG named after its title, on the dark background", async () => {
    const clicked = recordDownloads();
    vi.mocked(toPng).mockResolvedValue("data:image/png;base64,AAAA");
    await exportPng(document.createElement("div"), "Evolução do Brasil");
    expect(toPng).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ cacheBust: true }));
    expect(clicked[0].download).toBe("evolucao-do-brasil.png");
    expect(clicked[0].getAttribute("href")).toBe("data:image/png;base64,AAAA");
  });

  it("shows a notification when the PNG cannot be made", async () => {
    vi.mocked(toPng).mockRejectedValue(new Error("canvas bloqueado"));
    await exportPng(document.createElement("div"), "Painel");
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Falha ao exportar PNG", message: "canvas bloqueado" }),
    );
  });
});

describe("effective filter", () => {
  function wrapperWith(value: Parameters<typeof FilterProvider>[0]["value"]) {
    return ({ children }: { children: ReactNode }) => (
      <FilterProvider value={value}>{children}</FilterProvider>
    );
  }

  beforeEach(() => {
    useFilter.setState({ ...DEFAULT_FILTER, turno: 1, cargo: 1 });
    useTime.setState({ t: null });
  });

  it("is the global filter when no provider overrides it", () => {
    const { result } = renderHook(() => useEffectiveFilter());
    expect(result.current).toEqual({ turno: 1, cargo: 1, nivel: "country", id: "br", t: null });
  });

  it("takes the global time when the provider does not set one", () => {
    useTime.setState({ t: "2026-10-04T18:00:00Z" });
    const { result } = renderHook(() => useEffectiveFilter());
    expect(result.current.t).toBe("2026-10-04T18:00:00Z");
  });

  it("overrides the parts it sets and resolves the office of the state", () => {
    const { result } = renderHook(() => useEffectiveFilter(), {
      wrapper: wrapperWith({ turno: 2, nivel: "state", id: "df", cargo: 7, t: "2026-10-04T12:00:00Z" }),
    });
    expect(result.current).toEqual({
      turno: 2,
      cargo: 8,
      nivel: "state",
      id: "df",
      t: "2026-10-04T12:00:00Z",
    });
  });

  it("merges nested providers and freezes the time only when asked", () => {
    const outer = ({ children }: { children: ReactNode }) => (
      <FilterProvider value={{ nivel: "zone", id: "35-z0012", tFixo: true }}>
        <FilterProvider value={{ turno: 2, t: undefined }}>{children}</FilterProvider>
      </FilterProvider>
    );
    const { result: filter } = renderHook(() => useEffectiveFilter(), { wrapper: outer });
    expect(filter.current).toMatchObject({ turno: 2, nivel: "zone", id: "35-z0012" });
    const { result: fixed } = renderHook(() => useFixedTime(), { wrapper: outer });
    expect(fixed.current).toBe(true);
    const { result: notFixed } = renderHook(() => useFixedTime());
    expect(notFixed.current).toBe(false);
  });
});

describe("candidate colors", () => {
  beforeEach(() => {
    usePrefs.setState({ ...DEFAULT_PREFS, coresCandidatos: { "280001": "#123456" } });
  });

  it("prefers the user's color, then the given one, then the party color, then the fallback", () => {
    const { result } = renderHook(() => useCandidateColor());
    expect(result.current("280001", "#ffffff", 13)).toBe("#123456");
    expect(result.current("280002", "#ffffff", 13)).toBe("#ffffff");
    expect(result.current("280002", null, 13)).toBe(colorByNumber(13));
    expect(result.current(null, undefined, null)).toBe(FALLBACK_CANDIDATE_COLOR);
  });
});

describe("query options and WebSocket state", () => {
  it("keeps the live queries fresh and the historical ones immutable", () => {
    expect(timeQueryOptions("2026-10-04T18:00:00Z", true)).toMatchObject({ staleTime: Infinity });
    expect(timeQueryOptions(null, true)).toMatchObject({ staleTime: 20_000, refetchInterval: 60_000 });
    expect(timeQueryOptions(null, false)).toMatchObject({ refetchInterval: 30_000 });
  });

  it("tells whether the WebSocket is open", () => {
    useUi.setState({ wsStatus: "connecting" });
    const { result } = renderHook(() => useWsOpen());
    expect(result.current).toBe(false);
    act(() => useUi.getState().setWsStatus("open"));
    expect(result.current).toBe(true);
  });
});
