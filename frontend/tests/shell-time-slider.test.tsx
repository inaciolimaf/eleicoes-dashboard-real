import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";
import { EMPTY_TIMELINE, minutesAgo, resetStores, shellAnswers, timelineWith } from "./helpers/data-shell";
import { useTime } from "../src/lib/time-store";

const TIMELINE_EVENTS = [
  { id: 1, type: "start", title: "Início da apuração", occurred_at: minutesAgo(100), office_code: 1 },
  { id: 2, type: "elected", title: "Eleita", occurred_at: minutesAgo(40), office_code: 1 },
];

beforeEach(resetStores);
afterEach(() => {
  vi.useRealTimers();
});

describe("shell time slider", () => {
  it("draws one marker per event inside the window", async () => {
    fakeApi(shellAnswers({ "GET /timeline": timelineWith(TIMELINE_EVENTS) }));
    const { container } = await renderScreen("/conta");
    expect(await screen.findByRole("slider")).toBeInTheDocument();
    await vi.waitFor(() => expect(container.querySelectorAll(".marcador-evento")).toHaveLength(2));
  });

  it("explains the empty state while there is no timeline", async () => {
    fakeApi(shellAnswers({ "GET /timeline": EMPTY_TIMELINE }));
    await renderScreen("/conta");
    expect(
      await screen.findByText("A linha do tempo aparece com os primeiros snapshots da apuração."),
    ).toBeInTheDocument();
  });

  it("says the timeline is unavailable when the API fails", async () => {
    const answers = shellAnswers();
    delete answers["GET /timeline"];
    fakeApi(answers);
    await renderScreen("/conta");
    expect(await screen.findByText("Linha do tempo indisponível")).toBeInTheDocument();
  });

  it("starts and pauses the replay from its play button", async () => {
    fakeApi(shellAnswers({ "GET /timeline": timelineWith(TIMELINE_EVENTS) }));
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByRole("button", { name: "Reproduzir" }));
    expect(useTime.getState().tocando).toBe(true);
    await user.click(screen.getByRole("button", { name: "Pausar" }));
    expect(useTime.getState().tocando).toBe(false);
  });

  it("changes the replay speed", async () => {
    fakeApi(shellAnswers({ "GET /timeline": timelineWith(TIMELINE_EVENTS) }));
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByRole("radio", { name: "10×" }));
    expect(useTime.getState().velocidade).toBe(10);
  });

  it("jumps to the next event from the clock and back to the previous one", async () => {
    fakeApi(shellAnswers({ "GET /timeline": timelineWith(TIMELINE_EVENTS) }));
    const { user } = await renderScreen("/conta");
    await screen.findByRole("slider");
    useTime.setState({ t: new Date(Date.parse(minutesAgo(120))).toISOString() });
    await user.click(screen.getByRole("button", { name: "Próximo evento" }));
    expect(Date.parse(useTime.getState().t ?? "")).toBe(Date.parse(TIMELINE_EVENTS[0].occurred_at));
    await user.click(screen.getByRole("button", { name: "Próximo evento" }));
    expect(Date.parse(useTime.getState().t ?? "")).toBe(Date.parse(TIMELINE_EVENTS[1].occurred_at));
    await user.click(screen.getByRole("button", { name: "EventDto anterior" }));
    expect(Date.parse(useTime.getState().t ?? "")).toBe(Date.parse(TIMELINE_EVENTS[0].occurred_at));
  });

  it("offers to return to live from the novelty badge and the AO VIVO button", async () => {
    fakeApi(shellAnswers({ "GET /timeline": timelineWith(TIMELINE_EVENTS) }));
    const { user } = await renderScreen("/conta");
    useTime.setState({ t: minutesAgo(60), novidades: 2 });
    await user.click(await screen.findByText(/2 novidades/));
    expect(useTime.getState().t).toBeNull();
    useTime.setState({ t: minutesAgo(60) });
    await user.click(await screen.findByRole("button", { name: "AO VIVO" }));
    expect(useTime.getState().t).toBeNull();
  });
});
