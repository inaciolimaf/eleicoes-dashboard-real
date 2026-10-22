import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";
import { liveStatus, minutesAgo, resetStores, shellAnswers } from "./helpers/data-shell";
import { useTime } from "../src/lib/time-store";
import { usePrefs } from "../src/lib/prefs-store";

beforeEach(resetStores);

describe("shell header", () => {
  it("shows the brand, the election of the filter and the live state", async () => {
    fakeApi(shellAnswers());
    await renderScreen("/conta");
    expect(await screen.findByRole("button", { name: "AO VIVO" })).toBeInTheDocument();
    expect(screen.getByText("Apuração")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("2026 · 1º turno")[0]).toBeInTheDocument();
  });

  it("switches the theme and remembers it in the preferences", async () => {
    fakeApi(shellAnswers());
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByRole("button", { name: "Alternar tema" }));
    expect(usePrefs.getState().tema).toBe("claro");
  });

  it("says the live state is out of the air when the collector is not live", async () => {
    fakeApi(shellAnswers({ "GET /status": liveStatus({ live: false, release_start: null }) }));
    await renderScreen("/conta");
    expect(await screen.findByRole("button", { name: "Fora do ar" })).toBeInTheDocument();
  });

  it("announces the release time before the release starts", async () => {
    fakeApi(shellAnswers({ "GET /status": liveStatus({ live: false, release_start: minutesAgo(-60) }) }));
    await renderScreen("/conta");
    expect(await screen.findByRole("button", { name: /^Divulgação às \d{2}:\d{2}$/ })).toBeInTheDocument();
  });

  it("warns when the data is more than five minutes old", async () => {
    fakeApi(
      shellAnswers({
        "GET /status": liveStatus({ last_tally: minutesAgo(9), last_collection: minutesAgo(9) }),
      }),
    );
    await renderScreen("/conta");
    expect(await screen.findByRole("button", { name: /^Desatualizado há 9 min$/ })).toBeInTheDocument();
  });

  it("says there is no connection when the status cannot be read", async () => {
    fakeApi({ "GET /elections": [] });
    await renderScreen("/conta");
    expect(await screen.findByRole("button", { name: "Sem conexão" })).toBeInTheDocument();
  });

  it("shows the replay time and goes back to live when clicked", async () => {
    fakeApi(shellAnswers());
    const { user } = await renderScreen("/conta");
    useTime.setState({ t: minutesAgo(30) });
    await user.click(await screen.findByRole("button", { name: /^REPLAY / }));
    expect(useTime.getState().t).toBeNull();
  });
});
