import { QueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildrenDto, EventDto, MapPollingPlacesDto, WsServerMessage } from "../src/api/models";
import { qk } from "../src/api/query-keys";
import { DEFAULT_PREFS, usePrefs } from "../src/lib/prefs-store";
import { useTime } from "../src/lib/time-store";
import { applyMessage, notifyBrowser } from "../src/modules/realtime";

vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));

const msg = (m: Record<string, unknown>) => m as unknown as WsServerMessage;

function event(id: string, extra: Partial<EventDto> = {}): EventDto {
  return {
    id,
    type: "elected",
    title: `Evento ${id}`,
    description: null,
    level: "state",
    geo_area_id: "sp",
    office_code: 1,
    occurred_at: "2026-10-04T18:00:00Z",
    round: 1,
    ...extra,
  } as unknown as EventDto;
}

function children(items: unknown[], candidates: unknown[] = []): ChildrenDto {
  return { items, candidates } as unknown as ChildrenDto;
}

let qc: QueryClient;

beforeEach(() => {
  qc = new QueryClient();
  usePrefs.setState({ ...DEFAULT_PREFS, toasts: ["elected"], push: false });
  useTime.setState({ t: null, updates: 0 });
  vi.mocked(notifications.show).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("status and progress", () => {
  it("writes the status into its query", () => {
    applyMessage(qc, msg({ type: "status", data: { collector: "ok" } }));
    expect(qc.getQueryData(qk.status())).toEqual({ collector: "ok" });
  });

  it("writes the progress of the round when live, and nothing when frozen", () => {
    applyMessage(qc, msg({ type: "progress", topic: "progress:2", data: { pct: 40 } }));
    expect(qc.getQueryData(qk.progresso(2, null))).toEqual({ pct: 40 });
    useTime.setState({ t: "2026-10-04T18:00:00Z" });
    applyMessage(qc, msg({ type: "progress", topic: "progress:2", data: { pct: 90 } }));
    expect(qc.getQueryData(qk.progresso(2, null))).toEqual({ pct: 40 });
  });
});

describe("results", () => {
  it("replaces the live results of the area named by the topic", () => {
    applyMessage(qc, msg({ type: "results", topic: "results:1:1:state:sp", data: { totals: 1 } }));
    expect(qc.getQueryData(qk.resultados(1, 1, "state", "sp", null))).toEqual({ totals: 1 });
  });

  it("counts the update instead of applying it while the time is frozen", () => {
    useTime.setState({ t: "2026-10-04T18:00:00Z" });
    applyMessage(qc, msg({ type: "results", topic: "results:1:1:state:sp", data: { totals: 1 } }));
    expect(qc.getQueryData(qk.resultados(1, 1, "state", "sp", null))).toBeUndefined();
    expect(useTime.getState().updates).toBe(1);
  });
});

describe("events", () => {
  it("puts a new event at the top of the lists it belongs to, once", () => {
    qc.setQueryData(["eventos", 1, { office: 1, types: [], limit: 100 }], [event("old")]);
    applyMessage(qc, msg({ type: "event", topic: "events:1", data: event("new") }));
    applyMessage(qc, msg({ type: "event", topic: "events:1", data: event("new") }));
    const list = qc.getQueryData<EventDto[]>(["eventos", 1, { office: 1, types: [], limit: 100 }]);
    expect(list?.map((e) => e.id)).toEqual(["new", "old"]);
  });

  it("skips the lists whose filter does not match the event", () => {
    const filter = { office: 5, types: [], limit: 100 };
    qc.setQueryData(["eventos", 1, filter], [event("old", { office_code: 1 })]);
    qc.setQueryData(["eventos", 1, { level: "zone", id: "35-z1", limit: 100 }], [event("x")]);
    applyMessage(qc, msg({ type: "event", topic: "events:1", data: event("new") }));
    expect(qc.getQueryData<EventDto[]>(["eventos", 1, filter])?.map((e) => e.id)).toEqual(["old"]);
  });

  it("respects the type filter and keeps lists that have no data yet empty", () => {
    qc.setQueryData(["eventos", 1, { types: ["runoff"], limit: 100 }], []);
    qc.setQueryData(["eventos", 1, { limit: 100 }], undefined);
    applyMessage(qc, msg({ type: "event", topic: "events:1", data: event("e1", { type: "elected" }) }));
    expect(qc.getQueryData(["eventos", 1, { types: ["runoff"], limit: 100 }])).toEqual([]);
    expect(qc.getQueryData(["eventos", 1, { limit: 100 }])).toBeUndefined();
  });

  it("caps each list at its limit, and at least 100 items", () => {
    const filter = { limit: 2, types: [] };
    qc.setQueryData(["eventos", 1, filter], [event("a"), event("b")]);
    applyMessage(qc, msg({ type: "event", topic: "events:1", data: event("c") }));
    expect(qc.getQueryData<EventDto[]>(["eventos", 1, filter])).toHaveLength(3);
  });

  it("adds a country or state event to the timeline", () => {
    qc.setQueryData(qk.linha(1), { events: [] });
    applyMessage(qc, msg({ type: "event", topic: "events:1", data: event("tl", { level: "country" }) }));
    expect(qc.getQueryData<{ events: EventDto[] }>(qk.linha(1))?.events.map((e) => e.id)).toEqual(["tl"]);
  });

  it("notifies the user when the type is one of the chosen toasts", () => {
    applyMessage(
      qc,
      msg({ type: "event", topic: "events:1", data: event("t1", { description: "Vitória" }) }),
    );
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Evento t1", message: "Vitória", color: "green" }),
    );
  });

  it("does not notify for a type the user did not choose", () => {
    applyMessage(qc, msg({ type: "event", topic: "events:1", data: event("t2", { type: "start" }) }));
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("counts the event while the time is frozen", () => {
    useTime.setState({ t: "2026-10-04T18:00:00Z" });
    applyMessage(qc, msg({ type: "event", topic: "events:1", data: event("f1") }));
    expect(useTime.getState().updates).toBe(1);
  });

  it("uses the default message and color when the event has no description or a known color", () => {
    usePrefs.setState({ toasts: ["runoff"] });
    applyMessage(
      qc,
      msg({ type: "event", topic: "events:1", data: event("r1", { type: "runoff", description: null }) }),
    );
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: "2º turno", color: "yellow" }),
    );
  });
});

describe("alerts and errors", () => {
  it("shows an alert with the bell icon", () => {
    applyMessage(qc, msg({ type: "alert", data: { title: "Limite", description: "Passou de 50%" } }));
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ title: "🔔 Limite", message: "Passou de 50%", color: "grape" }),
    );
  });

  it("logs a server error and ignores unknown messages", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyMessage(qc, msg({ type: "error", message: "tópico inválido" }));
    applyMessage(qc, msg({ type: "pong" }));
    expect(warn).toHaveBeenCalledWith("[ws] erro do servidor:", "tópico inválido");
  });
});

describe("children and polling places", () => {
  it("adds a child to the cached children of the same level, and recounts the wins", () => {
    const key = qk.filhos(1, 1, "country", "br", "state", "", null);
    qc.setQueryData(key, children([], [{ tse_candidate_id: "280001", wins: 0 }]));
    const leader = { tse_candidate_id: "280001", ballot_name: "Ana", color: "#000000" };
    applyMessage(
      qc,
      msg({
        type: "children",
        topic: "children:1:1:country:br:state",
        data: { id: "sp", leader },
      }),
    );
    const updated = qc.getQueryData<ChildrenDto>(key);
    expect(updated?.items).toHaveLength(1);
    expect(updated?.candidates[0]).toMatchObject({ tse_candidate_id: "280001", wins: 1 });
  });

  it("replaces an existing child and keeps its values when the message has none", () => {
    const key = qk.filhos(1, 1, "state", "sp", null, "", null);
    qc.setQueryData(key, children([{ id: "35", name: "Old", values: { a: 1 }, leader: null }]));
    applyMessage(
      qc,
      msg({ type: "children", topic: "children:1:1:state:sp", data: { id: "35", name: "New" } }),
    );
    const updated = qc.getQueryData<ChildrenDto>(key);
    expect(updated?.items).toEqual([{ id: "35", name: "New", values: { a: 1 }, leader: null }]);
  });

  it("ignores children of another child level, or of a list frozen at a time", () => {
    const otherLevel = qk.filhos(1, 1, "state", "sp", "zone", "", null);
    const frozen = qk.filhos(1, 1, "state", "sp", null, "", "2026-10-04T18:00:00Z");
    qc.setQueryData(otherLevel, children([]));
    qc.setQueryData(frozen, children([]));
    applyMessage(qc, msg({ type: "children", topic: "children:1:1:state:sp", data: { id: "35" } }));
    expect(qc.getQueryData<ChildrenDto>(otherLevel)?.items).toEqual([]);
    expect(qc.getQueryData<ChildrenDto>(frozen)?.items).toEqual([]);
  });

  it("patches the polling place in the map list of the same municipality or state", () => {
    const key = qk.locais(1, 1, "35", null, null);
    qc.setQueryData<MapPollingPlacesDto>(key, {
      items: [{ id: "L1", name: "Velho" }],
      total: 1,
      truncated: false,
    } as never);
    applyMessage(
      qc,
      msg({ type: "polling_place", topic: "polling_places:1:1:3550308", data: { id: "L1", name: "Novo" } }),
    );
    expect(qc.getQueryData<MapPollingPlacesDto>(key)?.items[0]).toMatchObject({ name: "Novo" });
  });

  it("does not patch a map list of another state or with a time", () => {
    const cache = qc.getQueryCache();
    qc.setQueryData(qk.locais(1, 1, "41", null, null), { items: [{ id: "L1", name: "Velho" }] } as never);
    qc.setQueryData(qk.locais(1, 1, "35", null, "2026-10-04T18:00:00Z"), { items: [] } as never);
    applyMessage(
      qc,
      msg({ type: "polling_place", topic: "polling_places:1:1:3550308", data: { id: "L1", name: "Novo" } }),
    );
    expect(qc.getQueryData<MapPollingPlacesDto>(qk.locais(1, 1, "41", null, null))?.items[0]).toMatchObject({
      name: "Velho",
    });
    expect(cache.findAll()).toHaveLength(2);
  });
});

describe("notifyBrowser", () => {
  class FakeNotification {
    static permission = "granted";
    static shown: unknown[] = [];
    constructor(title: string, options: unknown) {
      FakeNotification.shown.push([title, options]);
    }
  }

  beforeEach(() => {
    vi.stubGlobal("Notification", FakeNotification);
    FakeNotification.shown = [];
    FakeNotification.permission = "granted";
  });

  it("shows a browser notification when the user turned it on and it is allowed", () => {
    usePrefs.setState({ push: true });
    notifyBrowser("Eleito", "Ana foi eleita");
    expect(FakeNotification.shown).toEqual([
      ["Eleito", { body: "Ana foi eleita", icon: "/favicon.svg", tag: "Eleito" }],
    ]);
  });

  it("does nothing when the user did not turn it on or the permission is not granted", () => {
    usePrefs.setState({ push: false });
    notifyBrowser("a", "b");
    usePrefs.setState({ push: true });
    FakeNotification.permission = "denied";
    notifyBrowser("a", "b");
    expect(FakeNotification.shown).toEqual([]);
  });

  it("ignores browsers that refuse the notification", () => {
    usePrefs.setState({ push: true });
    class Refusing {
      static permission = "granted";
      constructor() {
        throw new Error("só via service worker");
      }
    }
    vi.stubGlobal("Notification", Refusing);
    expect(() => notifyBrowser("a", "b")).not.toThrow();
  });
});
