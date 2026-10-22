import { beforeEach, describe, expect, it } from "vitest";
import { useAuth } from "../src/lib/auth-store";
import { DEFAULT_FILTER, useFilter } from "../src/lib/filter-store";
import { DEFAULT_PREFS, usePrefs } from "../src/lib/prefs-store";
import { useDesktopNav, useUi } from "../src/lib/ui-store";
import { useTime } from "../src/lib/time-store";

// Persisted stores: the merge functions read what older versions stored, so they are tested directly.
type Merge<T> = (saved: unknown, current: T) => T;

beforeEach(() => {
  localStorage.clear();
  useFilter.setState({ ...DEFAULT_FILTER });
  usePrefs.setState({ ...DEFAULT_PREFS, coresCandidatos: {} });
  useAuth.setState({ token: null, user: null });
  useUi.setState({ navbarOpen: false, tvMode: false, authOpen: false, wsStatus: "connecting" });
  useTime.setState({ t: null, playing: false, speed: 60, updates: 0 });
});

describe("filter store", () => {
  it("sets the geo area with its name", () => {
    useFilter.getState().setGeoArea("state", "sp", "São Paulo");
    expect(useFilter.getState()).toMatchObject({ nivel: "state", id: "sp", nome: "São Paulo" });
  });

  it("merges any part of the filter", () => {
    useFilter.getState().setFiltro({ turno: 2, cargo: 5 });
    expect(useFilter.getState()).toMatchObject({ turno: 2, cargo: 5, nivel: "country" });
  });

  it("saves the filter under its stored key, without the functions", () => {
    useFilter.getState().setFiltro({ turno: 2 });
    const saved = JSON.parse(localStorage.getItem("eleicoes.filtro") ?? "{}") as {
      state: Record<string, unknown>;
    };
    expect(saved.state).toEqual({
      ciclo: null,
      turno: 2,
      cargo: 1,
      nivel: "country",
      id: "br",
      nome: "Brasil",
    });
  });
});

describe("preferences store", () => {
  it("adds and removes the color of a candidate", () => {
    usePrefs.getState().setCor("280001", "#112233");
    expect(usePrefs.getState().coresCandidatos).toEqual({ "280001": "#112233" });
    usePrefs.getState().setCor("280001", null);
    expect(usePrefs.getState().coresCandidatos).toEqual({});
  });

  it("changes any preference", () => {
    usePrefs.getState().set({ tema: "claro", animacoes: false });
    expect(usePrefs.getState()).toMatchObject({ tema: "claro", animacoes: false, basemap: true });
    usePrefs.getState().carregar({ densidade: "compacta" });
    expect(usePrefs.getState().densidade).toBe("compacta");
  });

  it("renames the event types saved under the old names", () => {
    const merge = usePrefs.persist.getOptions().merge as Merge<ReturnType<typeof usePrefs.getState>>;
    const merged = merge({ toasts: ["virada", "finalizado", "elected"] }, usePrefs.getState());
    expect(merged.toasts).toEqual(["lead_change", "milestone", "elected"]);
  });

  it("keeps the current toasts when the saved preferences have none", () => {
    const merge = usePrefs.persist.getOptions().merge as Merge<ReturnType<typeof usePrefs.getState>>;
    const merged = merge({ push: true }, usePrefs.getState());
    expect(merged.toasts).toEqual(DEFAULT_PREFS.toasts);
    expect(merged.push).toBe(true);
  });
});

describe("auth store", () => {
  const user = { id: "u1", email: "ana@example.com", name: "Ana", is_admin: false };

  it("opens and ends the session", () => {
    useAuth.getState().setSession("tok", user);
    expect(useAuth.getState()).toMatchObject({ token: "tok", user });
    useAuth.getState().setUser({ ...user, name: "Ana Lima" });
    expect(useAuth.getState().user?.name).toBe("Ana Lima");
    useAuth.getState().signOut();
    expect(useAuth.getState()).toMatchObject({ token: null, user: null });
  });

  it("reads a session saved before the migration (usuario with nome) as the user", () => {
    const merge = useAuth.persist.getOptions().merge as Merge<ReturnType<typeof useAuth.getState>>;
    const legacy = {
      token: "tok",
      usuario: { id: "u1", email: "ana@example.com", nome: "Ana", is_admin: true },
    };
    const merged = merge(legacy, useAuth.getState());
    expect(merged.user).toMatchObject({ id: "u1", name: "Ana", is_admin: true });
    expect(merged.token).toBe("tok");
  });

  it("keeps the user when the saved session already has one", () => {
    const merge = useAuth.persist.getOptions().merge as Merge<ReturnType<typeof useAuth.getState>>;
    expect(merge({ user }, useAuth.getState()).user).toEqual(user);
    expect(merge({}, useAuth.getState()).user).toBeNull();
  });
});

describe("ui store", () => {
  it("toggles and sets the layout flags", () => {
    useUi.getState().toggleNavbar();
    expect(useUi.getState().navbarOpen).toBe(true);
    useUi.getState().setNavbar(false);
    useUi.getState().setTvMode(true);
    useUi.getState().setAuthOpen(true);
    expect(useUi.getState()).toMatchObject({ navbarOpen: false, tvMode: true, authOpen: true });
  });

  it("keeps the WebSocket state", () => {
    useUi.getState().setWsStatus("open");
    expect(useUi.getState().wsStatus).toBe("open");
  });

  it("toggles the desktop navigation", () => {
    const before = useDesktopNav.getState().aberta;
    useDesktopNav.getState().toggle();
    expect(useDesktopNav.getState().aberta).toBe(!before);
  });
});

describe("time store", () => {
  it("selects an instant and returns to live", () => {
    useTime.getState().setT("2026-10-04T18:00:00Z");
    expect(useTime.getState().t).toBe("2026-10-04T18:00:00Z");
    useTime.getState().incUpdates();
    useTime.getState().incUpdates();
    expect(useTime.getState().updates).toBe(2);
    useTime.getState().setT(null);
    expect(useTime.getState()).toMatchObject({ t: null, playing: false, updates: 0 });
  });

  it("plays at a speed and resets to live", () => {
    useTime.getState().setSpeed(300);
    useTime.getState().setPlaying(true);
    expect(useTime.getState()).toMatchObject({ speed: 300, playing: true });
    useTime.getState().incUpdates();
    useTime.getState().goLive();
    expect(useTime.getState()).toMatchObject({ t: null, playing: false, updates: 0 });
  });
});
