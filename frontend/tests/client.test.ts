import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, readProblem } from "../src/api/client";

function respond(body: string, init: ResponseInit) {
  return vi.fn().mockResolvedValue(new Response(body, init));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api errors", () => {
  it("turns a problem+json response into an ApiError with title and detail", async () => {
    const problem = {
      type: "auth/email_taken",
      title: "Conflito",
      status: 409,
      detail: "e-mail já cadastrado",
    };
    vi.stubGlobal(
      "fetch",
      respond(JSON.stringify(problem), {
        status: 409,
        headers: { "content-type": "application/problem+json" },
      }),
    );

    const erro = await api("/auth/register", { method: "POST", body: {} }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiError);
    expect(erro).toMatchObject({ status: 409, title: "Conflito", detail: "e-mail já cadastrado" });
    expect((erro as ApiError).message).toBe("e-mail já cadastrado");
  });

  it("calls the versioned route", async () => {
    const fetchMock = respond("[]", { status: 200, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", fetchMock);

    await api("/elections", { params: { round: 1, office: undefined } });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/elections?round=1");
  });

  it("keeps a non-JSON error readable (proxy HTML page)", async () => {
    vi.stubGlobal(
      "fetch",
      respond("<html><body>502 Bad Gateway</body></html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );

    const erro = await api("/status").catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiError);
    expect(erro).toMatchObject({ status: 502 });
    expect((erro as ApiError).title).toBe("Erro");
    expect((erro as ApiError).detail).toBe("O servidor encontrou um erro. Tente de novo em instantes.");
  });

  it("reads a problem with no JSON body using the status defaults", async () => {
    const erro = await readProblem(new Response("", { status: 404 }));

    expect(erro).toMatchObject({ status: 404, title: "Não encontrado", detail: "Não encontrado." });
  });

  it("uses the first validation message when the body is a FastAPI error list", async () => {
    const corpo = { detail: [{ loc: ["query", "round"], msg: "valor inválido", type: "int" }] };
    const erro = await readProblem(
      new Response(JSON.stringify(corpo), { status: 422, headers: { "content-type": "application/json" } }),
    );

    expect(erro).toMatchObject({ status: 422, detail: "valor inválido" });
  });
});
