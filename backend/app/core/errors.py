"""Erros da API: um único formato, `application/problem+json` (RFC 9457).

`AppError` é o erro de domínio: `detail` explica ao usuário o que fazer (texto do produto, em
português) e `type` é o código estável em inglês no formato `domain/reason`. Um único handler
registrado cobre `AppError`, `HTTPException` (inclusive as rotas que o FastAPI gera) e
`RequestValidationError`.
"""

import re
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_MEDIA_TYPE = "application/problem+json"
_TIPO = re.compile(r"^[a-z][a-z0-9_]*/[a-z][a-z0-9_]*$")

_TITULOS = {
    400: "Requisição inválida",
    401: "Não autenticado",
    403: "Acesso negado",
    404: "Não encontrado",
    405: "Método não permitido",
    409: "Conflito",
    422: "Dados inválidos",
    429: "Muitas tentativas",
    500: "Erro interno",
    502: "Serviço externo indisponível",
    503: "Serviço indisponível",
}
_DETALHES = {
    400: "A requisição não pôde ser processada.",
    401: "Entre na conta para continuar.",
    403: "Você não tem permissão para esta ação.",
    404: "O recurso pedido não existe.",
    405: "Este método não é aceito nesta rota.",
    409: "O estado atual impede esta ação.",
    422: "Confira os dados enviados e tente de novo.",
    500: "Erro inesperado no servidor. Tente de novo em instantes.",
    502: "Um serviço externo não respondeu. Tente de novo em instantes.",
    503: "O serviço está temporariamente indisponível. Tente de novo em instantes.",
}


class AppError(Exception):
    """Erro de domínio que vira `problem+json`. `detail` nunca vazio."""

    def __init__(
        self,
        status_code: int,
        title: str,
        detail: str,
        type: str,  # noqa: A002 - é o nome do campo do RFC 9457
        extras: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        if not detail or not detail.strip():
            raise ValueError("AppError exige um detail que explique o que fazer")
        if not _TIPO.match(type):
            raise ValueError(f"type deve ser 'dominio/motivo' em minúsculas: {type!r}")
        super().__init__(detail)
        self.status_code = status_code
        self.title = title
        self.detail = detail
        self.type = type
        self.extras = extras or {}
        #: Cabeçalhos extras da resposta, por exemplo `Retry-After` no 429.
        self.headers = headers or {}


def problem(
    status_code: int,
    title: str,
    detail: str,
    type_: str,
    extras: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    corpo = {"type": type_, "title": title, "status": status_code, "detail": detail, **(extras or {})}
    return JSONResponse(corpo, status_code=status_code, media_type=PROBLEM_MEDIA_TYPE, headers=headers)


def _de_http(exc: StarletteHTTPException) -> JSONResponse:
    codigo = exc.status_code
    detalhe = (
        exc.detail
        if isinstance(exc.detail, str) and exc.detail.strip()
        else _DETALHES.get(codigo, "Erro na requisição.")
    )
    return problem(codigo, _TITULOS.get(codigo, "Erro"), detalhe, f"http/{codigo}")


def _de_validacao(exc: RequestValidationError) -> JSONResponse:
    erros = [
        {
            "loc": [str(p) for p in e.get("loc", ())],
            "msg": str(e.get("msg", "inválido")),
            "type": str(e.get("type", "")),
        }
        for e in exc.errors()
    ]
    campos = "; ".join(f"{'.'.join(e['loc'])}: {e['msg']}" for e in erros) or "corpo da requisição"
    return problem(
        422,
        _TITULOS[422],
        f"Dados inválidos em {campos}. Corrija o campo e envie de novo.",
        "request/invalid",
        {"errors": erros},
    )


async def handle_error(request: Request, exc: Exception) -> JSONResponse:
    """O único handler: converte qualquer erro conhecido em `problem+json`."""
    if isinstance(exc, AppError):
        return problem(exc.status_code, exc.title, exc.detail, exc.type, exc.extras, exc.headers)
    if isinstance(exc, RequestValidationError):
        return _de_validacao(exc)
    if isinstance(exc, StarletteHTTPException):
        return _de_http(exc)
    raise exc


def install_error_handlers(app: FastAPI) -> None:
    for tipo in (AppError, StarletteHTTPException, RequestValidationError):
        app.add_exception_handler(tipo, handle_error)
