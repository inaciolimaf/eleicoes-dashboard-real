import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeApi } from "./helpers/screen";
import { VOTER_USER, resetStores } from "./helpers/data-shell";
import { useFavorites } from "../src/modules/accounts";
import { useAuth } from "../src/lib/auth-store";

beforeEach(resetStores);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ANA = { type: "candidate", ref: "280001", label: "Ana Lima" } as const;

describe("favorites without an account", () => {
  it("adds and removes a favorite in the browser", () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    act(() => result.current.toggle({ ...ANA }));
    expect(result.current.isFavorite("candidate", "280001")).toBe(true);
    expect(JSON.parse(localStorage.getItem("eleicoes.favoritos") ?? "{}")).toEqual({
      state: { favoritos: [ANA] },
      version: 0,
    });
    act(() => result.current.toggle({ ...ANA }));
    expect(result.current.isFavorite("candidate", "280001")).toBe(false);
    expect(result.current.favorites).toEqual([]);
  });
});

describe("favorites with an account", () => {
  it("reads the account's favorites from the API", async () => {
    useAuth.setState({ token: "token-abc", user: VOTER_USER });
    fakeApi({ "GET /favorites": [ANA] });
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));
    expect(result.current.isFavorite("candidate", "280001")).toBe(true);
  });

  it("removes an account favorite through the API", async () => {
    useAuth.setState({ token: "token-abc", user: VOTER_USER });
    const api = fakeApi({ "GET /favorites": [ANA], "DELETE /favorites/candidate/280001": null });
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));
    act(() => result.current.toggle({ ...ANA }));
    await waitFor(() => expect(api.calls("DELETE /favorites/candidate/280001")).toHaveLength(1));
  });

  it("adds an account favorite through the API", async () => {
    useAuth.setState({ token: "token-abc", user: VOTER_USER });
    const api = fakeApi({ "GET /favorites": [], "POST /favorites": ANA });
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.favorites).toEqual([]));
    act(() => result.current.toggle({ ...ANA }));
    await waitFor(() => expect(api.calls("POST /favorites")).toHaveLength(1));
    expect(api.calls("POST /favorites")[0]?.body).toEqual(ANA);
  });
});
