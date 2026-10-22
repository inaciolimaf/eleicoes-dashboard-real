import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";
import {
  ADMIN_HEALTH,
  ADMIN_USER,
  FAKE_TSE_STATE,
  VOTER_USER,
  failWith,
  liveStatus,
  resetStores,
  shellAnswers,
} from "./helpers/data-shell";
import type { StatusDto } from "../src/api/models";
import { useAuth } from "../src/lib/auth-store";

const ADMIN_ANSWERS = {
  "GET /admin/health": ADMIN_HEALTH,
  "GET /admin/fake-tse": FAKE_TSE_STATE,
  "POST /admin/collector/pause": null,
  "POST /admin/collector/resume": null,
  "POST /admin/fake-tse": FAKE_TSE_STATE,
};

beforeEach(() => {
  resetStores();
  useAuth.setState({ token: "token-abc", user: ADMIN_USER });
});

describe("admin screen", () => {
  it("refuses the page to a voter", async () => {
    useAuth.setState({ token: "token-abc", user: VOTER_USER });
    fakeApi(shellAnswers());
    await renderScreen("/admin");
    expect(await screen.findByText("Acesso restrito")).toBeInTheDocument();
  });

  it("shows the collector and the health metrics to an administrator", async () => {
    fakeApi(shellAnswers({ ...ADMIN_ANSWERS }));
    await renderScreen("/admin");
    expect(await screen.findByText("Coletor do TSE")).toBeInTheDocument();
    expect(await screen.findByText("Queue size")).toBeInTheDocument();
    expect(screen.getByText("Workers")).toBeInTheDocument();
    expect(screen.getByText("Jobs done")).toBeInTheDocument();
  });

  it("pauses the collector and confirms it", async () => {
    const api = fakeApi(shellAnswers({ ...ADMIN_ANSWERS }));
    const { user } = await renderScreen("/admin");
    await user.click(await screen.findByRole("button", { name: "Pausar" }));
    expect(await screen.findByText("Coletor pausado")).toBeInTheDocument();
    expect(api.calls("POST /admin/collector/pause")).toHaveLength(1);
  });

  it("resumes a paused collector", async () => {
    const api = fakeApi(
      shellAnswers({
        ...ADMIN_ANSWERS,
        "GET /status": liveStatus({
          collector: { paused: true, requests_per_second: 0 } as StatusDto["collector"],
        }),
      }),
    );
    const { user } = await renderScreen("/admin");
    await user.click(await screen.findByRole("button", { name: "Retomar" }));
    await waitFor(() => expect(api.calls("POST /admin/collector/resume")).toHaveLength(1));
  });

  it("shows the API's reason when a command fails", async () => {
    fakeApi(shellAnswers({ ...ADMIN_ANSWERS }));
    failWith("POST /admin/collector/pause", 409, "o coletor já está pausado");
    const { user } = await renderScreen("/admin");
    await user.click(await screen.findByRole("button", { name: "Pausar" }));
    expect(await screen.findByText("o coletor já está pausado")).toBeInTheDocument();
  });

  it("applies a speed to the fake clock", async () => {
    const api = fakeApi(shellAnswers({ ...ADMIN_ANSWERS }));
    const { user } = await renderScreen("/admin");
    await user.click(await screen.findByRole("button", { name: "Aplicar velocidade" }));
    await waitFor(() => expect(api.calls("POST /admin/fake-tse")).toHaveLength(1));
    expect(api.calls("POST /admin/fake-tse")[0]?.body).toEqual({ speed: 60 });
  });

  it("pauses the fake clock", async () => {
    const api = fakeApi(shellAnswers({ ...ADMIN_ANSWERS }));
    const { user } = await renderScreen("/admin");
    await user.click(await screen.findByRole("button", { name: "Pausar relógio" }));
    await waitFor(() => expect(api.calls("POST /admin/fake-tse")).toHaveLength(1));
    expect(api.calls("POST /admin/fake-tse")[0]?.body).toEqual({ paused: true });
  });

  it("restarts the simulation only after confirmation", async () => {
    const api = fakeApi(shellAnswers({ ...ADMIN_ANSWERS }));
    const { user } = await renderScreen("/admin");
    await user.click(await screen.findByRole("button", { name: "Reiniciar" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.calls("POST /admin/fake-tse")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Reiniciar" }));
    await waitFor(() => expect(api.calls("POST /admin/fake-tse")).toHaveLength(1));
    expect(api.calls("POST /admin/fake-tse")[0]?.body).toEqual({ restart: true });
  });

  it("toggles the raw JSON of the health payload", async () => {
    fakeApi(shellAnswers({ ...ADMIN_ANSWERS }));
    const { user } = await renderScreen("/admin");
    await user.click(await screen.findByRole("button", { name: "Ver JSON bruto" }));
    expect(screen.getByRole("button", { name: "Ocultar JSON" })).toBeInTheDocument();
  });

  it("says the fake clock is unavailable outside the fake environment", async () => {
    fakeApi(shellAnswers({ "GET /admin/health": ADMIN_HEALTH }));
    await renderScreen("/admin");
    expect(await screen.findByText(/Indisponível/)).toBeInTheDocument();
  });
});
