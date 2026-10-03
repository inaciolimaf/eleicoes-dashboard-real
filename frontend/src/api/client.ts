import { useAuth } from "../store/auth";

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
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

export function urlApi(path: string, params?: Params): string {
  return `${API_BASE}${path}${qs(params)}`;
}

interface Opts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Params;
  signal?: AbortSignal;
}

function mensagemDeErro(status: number, corpo: unknown): string {
  if (corpo && typeof corpo === "object" && "detail" in corpo) {
    const d = (corpo as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length && typeof d[0] === "object" && d[0] && "msg" in d[0]) {
      return String((d[0] as { msg: unknown }).msg);
    }
  }
  if (status === 401) return "Sessão expirada ou credenciais inválidas.";
  if (status === 403) return "Acesso negado.";
  if (status === 404) return "Não encontrado.";
  if (status >= 500) return "O servidor encontrou um erro. Tente de novo em instantes.";
  return `Erro ${status}`;
}

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const { method = "GET", body, params, signal } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = useAuth.getState().token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let resp: Response;
  try {
    resp = await fetch(urlApi(path, params), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Sem conexão com o servidor.");
  }
  if (resp.status === 204) return undefined as T;
  const tipo = resp.headers.get("content-type") ?? "";
  const corpo: unknown = tipo.includes("json") ? await resp.json().catch(() => null) : await resp.text().catch(() => null);
  if (!resp.ok) {
    if (resp.status === 401 && token && !path.startsWith("/auth/")) useAuth.getState().sair();
    throw new ApiError(resp.status, mensagemDeErro(resp.status, corpo), corpo);
  }
  return corpo as T;
}

export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;
