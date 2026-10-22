import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";
import { ADMIN_USER, DASHBOARDS, VOTER_USER, resetStores } from "./helpers/data-shell";
import { useAuth } from "../src/lib/auth-store";

beforeEach(resetStores);

describe("shell navbar", () => {
  it("lists the dashboards and points the default one at the home screen", async () => {
    useAuth.setState({ token: "token", user: VOTER_USER });
    fakeApi({ "GET /dashboards": DASHBOARDS });
    await renderScreen("/conta");
    const main = await screen.findByRole("link", { name: "Painel Principal" });
    expect(main).toHaveAttribute("href", "/paineis/dash-main");
    expect(screen.getByRole("link", { name: "Painel Secundário" })).toHaveAttribute(
      "href",
      "/paineis/dash-second",
    );
  });

  it("offers the election night template when the user has no dashboard", async () => {
    fakeApi({});
    await renderScreen("/conta");
    expect(await screen.findByRole("link", { name: /Noite da eleição/ })).toHaveAttribute("href", "/");
  });

  it("shows the admin entry only to administrators", async () => {
    fakeApi({});
    await renderScreen("/conta");
    expect(await screen.findByRole("link", { name: "Preferências" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("shows the admin entry to an administrator", async () => {
    useAuth.setState({ token: "token", user: ADMIN_USER });
    fakeApi({});
    await renderScreen("/conta");
    expect(await screen.findByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("opens the new dashboard modal from the Criar button", async () => {
    fakeApi({});
    const { user } = await renderScreen("/conta");
    await user.click(await screen.findByRole("button", { name: "Criar" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("marks the current screen as active", async () => {
    fakeApi({});
    await renderScreen("/conta");
    expect(await screen.findByRole("link", { name: "Preferências" })).toHaveAttribute("data-active");
    expect(screen.getByRole("link", { name: "Mapas" })).not.toHaveAttribute("data-active");
  });
});
