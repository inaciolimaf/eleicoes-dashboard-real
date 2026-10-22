import { useAuth } from "../lib/auth-store";

export const BASE = "/api/v1";

/** API error: the backend's `application/problem+json` (RFC 9457). `detail` is the text shown to the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;

  constructor(status: number, title: string, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

export type Params = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function qs(params?: Params): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(","));
    } else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

interface Opts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Params;
  signal?: AbortSignal;
}

const DEFAULT_TITLES: Record<number, string> = {
  401: "Não autenticado",
  403: "Acesso negado",
  404: "Não encontrado",
  409: "Conflito",
  422: "Dados inválidos",
  429: "Muitas tentativas",
};

const DEFAULT_DETAILS: Record<number, string> = {
  401: "Sessão expirada ou credenciais inválidas.",
  403: "Acesso negado.",
  404: "Não encontrado.",
};

/** Reads the error of a response. Accepts problem+json; a body that is not JSON (a proxy's HTML, plain text) gets the default for its status. */
export async function readProblem(resp: Response): Promise<ApiError> {
  const text = await resp.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }
  const title =
    typeof body.title === "string" && body.title ? body.title : (DEFAULT_TITLES[resp.status] ?? "Erro");
  const detail = detailOf(body.detail) ?? defaultDetail(resp.status);
  return new ApiError(resp.status, title, detail);
}

/** The message of a `detail`: a string, or the first message of FastAPI's validation list. */
function detailOf(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: unknown } | null;
    if (first && typeof first.msg === "string") return first.msg;
  }
  return null;
}

function defaultDetail(status: number): string {
  if (status >= 500) return "O servidor encontrou um erro. Tente de novo em instantes.";
  return DEFAULT_DETAILS[status] ?? `Erro ${status}`;
}

/** Calls the API (JSON in and out). Errors are thrown as `ApiError`; a 401 on a session call ends the session. */
export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const { method = "GET", body, params, signal } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = useAuth.getState().token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}${qs(params)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Sem conexão", "Sem conexão com o servidor.");
  }
  if (!resp.ok) {
    const error = await readProblem(resp);
    if (resp.status === 401 && token && !path.startsWith("/auth/")) useAuth.getState().sair();
    throw error;
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;
