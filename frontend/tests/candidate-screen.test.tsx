import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeApi, renderScreen } from "./helpers/screen";

describe("candidate screen", () => {
  it("asks the API for the candidate in the URL", async () => {
    const api = fakeApi({});
    await renderScreen("/candidatos/280001234567");
    await waitFor(() => expect(api.calls("GET /candidates/280001234567").length).toBeGreaterThan(0));
  });
});
