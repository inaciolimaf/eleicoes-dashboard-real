import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";
import { minutesAgo, resetStores } from "./helpers/data-shell";
import { useTime } from "../src/lib/time-store";
import { useBrowserFavorites } from "../src/modules/accounts/store";

beforeEach(resetStores);

/** Favorites as an older browser saved them: the `favoritos` field with the `tipo` and `rotulo` keys. */
function saveLegacyFavorites(): void {
  localStorage.setItem(
    "eleicoes.favoritos",
    JSON.stringify({
      state: { favoritos: [{ tipo: "candidato", ref: "280001", rotulo: "Ana Lima" }] },
      version: 0,
    }),
  );
}

describe("shell filter bar", () => {
  it("shows the national scope and the office of the filter", async () => {
    fakeApi({});
    await renderScreen("/conta");
    expect(await screen.findByRole("button", { name: "Brasil" })).toBeInTheDocument();
    expect(screen.getByText(/Presidente · 1º turno/)).toBeInTheDocument();
  });

  it("lists the favorites saved by an older browser, linking to the candidate", async () => {
    saveLegacyFavorites();
    await useBrowserFavorites.persist.rehydrate();
    fakeApi({});
    await renderScreen("/conta");
    const chip = await screen.findByRole("link", { name: /Ana Lima/ });
    expect(chip).toHaveAttribute("href", "/candidatos/280001");
  });

  it("stars the current scope and saves the favorite in the browser", async () => {
    fakeApi({});
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByRole("button", { name: "Favoritar recorte" }));
    const saved = JSON.parse(localStorage.getItem("eleicoes.favoritos") ?? "{}") as {
      state: { favoritos: { type: string; ref: string; label: string }[] };
    };
    expect(saved.state.favoritos).toEqual([{ type: "geo_area", ref: "country:br", label: "Brasil" }]);
  });

  it("removes a starred scope when it is starred again", async () => {
    localStorage.setItem(
      "eleicoes.favoritos",
      JSON.stringify({
        state: { favoritos: [{ type: "geo_area", ref: "country:br", label: "Brasil" }] },
        version: 0,
      }),
    );
    await useBrowserFavorites.persist.rehydrate();
    fakeApi({});
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByRole("button", { name: "Favoritar recorte" }));
    const saved = JSON.parse(localStorage.getItem("eleicoes.favoritos") ?? "{}") as {
      state: { favoritos: unknown[] };
    };
    expect(saved.state.favoritos).toEqual([]);
  });

  it("shows the replay time and returns to live from its chip", async () => {
    fakeApi({});
    const { user } = await renderScreen("/conta");
    useTime.setState({ t: minutesAgo(10) });
    await user.click(await screen.findByRole("button", { name: "Voltar ao vivo" }));
    expect(useTime.getState().t).toBeNull();
  });
});
