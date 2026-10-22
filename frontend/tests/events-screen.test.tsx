import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";
import { DEFAULT_FILTER, useFilter } from "../src/lib/filter-store";
import { useTime } from "../src/lib/time-store";

const EVENTS = [
  {
    id: "e1",
    type: "elected",
    title: "Ana Azul eleita",
    description: "Maioria das seções apuradas",
    level: "state",
    geo_area_id: "sp",
    office_code: "1",
    occurred_at: "2026-10-04T18:00:00Z",
    round: 1,
  },
  {
    id: "e2",
    type: "milestone",
    title: "50% das seções apuradas",
    description: null,
    level: "country",
    geo_area_id: "br",
    office_code: null,
    occurred_at: "2026-10-04T17:00:00Z",
    round: 1,
  },
];

beforeEach(() => {
  useFilter.setState({ ...DEFAULT_FILTER });
  useTime.setState({ t: null, novidades: 0 });
});

describe("events screen", () => {
  it("lists the events of the round, with their type and office", async () => {
    fakeApi({ "GET /events": EVENTS });
    await renderScreen("/eventos");
    expect(await screen.findByText("Ana Azul eleita")).toBeInTheDocument();
    expect(screen.getByText("Maioria das seções apuradas")).toBeInTheDocument();
    expect(screen.getAllByText("Eleito").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Marco da apuração").length).toBeGreaterThan(0);
  });

  it("filters the events to the office of the filter when the switch is on", async () => {
    const api = fakeApi({ "GET /events": EVENTS });
    const { user } = await renderScreen("/eventos");
    await screen.findByText("Ana Azul eleita");
    expect(api.calls("GET /events").at(-1)?.query.has("office")).toBe(false);
    await user.click(screen.getByLabelText("Só Presidente"));
    await screen.findByText("Ana Azul eleita");
    expect(api.calls("GET /events").at(-1)?.query.get("office")).toBe("1");
  });

  it("sends the chosen event types and the limit", async () => {
    const api = fakeApi({ "GET /events": EVENTS });
    await renderScreen("/eventos");
    await screen.findByText("Ana Azul eleita");
    expect(api.calls("GET /events")[0]?.query.get("limit")).toBe("100");
    expect(api.calls("GET /events")[0]?.query.get("round")).toBe("1");
  });

  it("opens the panel of the event's moment when the clock button is pressed", async () => {
    fakeApi({ "GET /events": EVENTS });
    const { user } = await renderScreen("/eventos");
    await screen.findByText("Ana Azul eleita");
    await user.click(screen.getAllByRole("button", { name: "Ir para este momento" })[0]);
    expect(useTime.getState().t).toBe("2026-10-04T18:00:00Z");
  });

  it("says when there are no events yet", async () => {
    fakeApi({ "GET /events": [] });
    await renderScreen("/eventos");
    expect(await screen.findByText("Nenhum evento ainda")).toBeInTheDocument();
  });

  it("links an event to the screen of its geo area", async () => {
    fakeApi({ "GET /events": EVENTS });
    await renderScreen("/eventos");
    const link = await screen.findByRole("link", { name: "Ana Azul eleita" });
    expect(link).toHaveAttribute("href", "/explorar/uf/sp");
  });

  it("draws the icon of each API event type, not only the default flag", async () => {
    fakeApi({ "GET /events": [{ ...EVENTS[0], id: "e3", type: "lead_change", title: "Virada no estado" }] });
    const { container } = await renderScreen("/eventos");
    await screen.findByText("Virada no estado");
    expect(container.querySelector(".tabler-icon-arrows-exchange")).not.toBeNull();
  });
});
