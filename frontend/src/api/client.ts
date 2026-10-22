import { useAuth } from "../store/auth";

export const BASE = "/api/v1";

/** Erro da API: o `application/problem+json` (RFC 9457) do backend. `detail` é o texto para o usuário. */
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

const TITULO_PADRAO: Record<number, string> = {
  401: "Não autenticado",
  403: "Acesso negado",
  404: "Não encontrado",
  409: "Conflito",
  422: "Dados inválidos",
  429: "Muitas tentativas",
};

const DETALHE_PADRAO: Record<number, string> = {
  401: "Sessão expirada ou credenciais inválidas.",
  403: "Acesso negado.",
  404: "Não encontrado.",
};

/** Lê o erro de uma resposta. Aceita problem+json; corpo que não é JSON (HTML de proxy, texto) vira o padrão do status. */
export async function readProblem(resp: Response): Promise<ApiError> {
  const texto = await resp.text().catch(() => "");
  let corpo: Record<string, unknown> = {};
  try {
    const lido: unknown = JSON.parse(texto);
    if (lido && typeof lido === "object") corpo = lido as Record<string, unknown>;
  } catch {
    corpo = {};
  }
  const titulo =
    typeof corpo.title === "string" && corpo.title ? corpo.title : (TITULO_PADRAO[resp.status] ?? "Erro");
  const detalhe = detalheDe(corpo.detail) ?? detalhePadrao(resp.status);
  return new ApiError(resp.status, titulo, detalhe);
}

function detalheDe(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail;
  // validação do FastAPI (lista de erros): a primeira mensagem
  if (Array.isArray(detail) && detail.length) {
    const primeiro = detail[0] as { msg?: unknown } | null;
    if (primeiro && typeof primeiro.msg === "string") return primeiro.msg;
  }
  return null;
}

function detalhePadrao(status: number): string {
  if (status >= 500) return "O servidor encontrou um erro. Tente de novo em instantes.";
  return DETALHE_PADRAO[status] ?? `Erro ${status}`;
}

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
    const erro = await readProblem(resp);
    if (resp.status === 401 && token && !path.startsWith("/auth/")) useAuth.getState().sair();
    throw erro;
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;
