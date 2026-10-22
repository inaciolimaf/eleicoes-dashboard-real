"""API errors: one format, `application/problem+json` (RFC 9457).

`AppError` is the domain error: `detail` tells the user what to do (product text, in Portuguese),
and `type` is the stable English code in the `domain/reason` form. One registered handler covers
`AppError`, `HTTPException` (including the routes FastAPI generates) and `RequestValidationError`.
"""

import re
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_MEDIA_TYPE = "application/problem+json"
_TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*/[a-z][a-z0-9_]*$")

_TITLES = {
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
_DETAILS = {
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
    """Domain error rendered as `problem+json`. `detail` is never empty."""

    def __init__(
        self,
        status_code: int,
        title: str,
        detail: str,
        type: str,  # noqa: A002 - the field name in RFC 9457
        extras: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        if not detail or not detail.strip():
            raise ValueError("AppError exige um detail que explique o que fazer")
        if not _TYPE_PATTERN.match(type):
            raise ValueError(f"type deve ser 'dominio/motivo' em minúsculas: {type!r}")
        super().__init__(detail)
        self.status_code = status_code
        self.title = title
        self.detail = detail
        self.type = type
        self.extras = extras or {}
        #: Extra response headers, for example `Retry-After` on a 429.
        self.headers = headers or {}


def problem(
    status_code: int,
    title: str,
    detail: str,
    type_: str,
    extras: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = {"type": type_, "title": title, "status": status_code, "detail": detail, **(extras or {})}
    return JSONResponse(body, status_code=status_code, media_type=PROBLEM_MEDIA_TYPE, headers=headers)


def _from_http(exc: StarletteHTTPException) -> JSONResponse:
    code = exc.status_code
    detail_text = (
        exc.detail
        if isinstance(exc.detail, str) and exc.detail.strip()
        else _DETAILS.get(code, "Erro na requisição.")
    )
    return problem(code, _TITLES.get(code, "Erro"), detail_text, f"http/{code}")


def _from_validation(exc: RequestValidationError) -> JSONResponse:
    errors = [
        {
            "loc": [str(p) for p in e.get("loc", ())],
            "msg": str(e.get("msg", "inválido")),
            "type": str(e.get("type", "")),
        }
        for e in exc.errors()
    ]
    fields_text = "; ".join(f"{'.'.join(e['loc'])}: {e['msg']}" for e in errors) or "corpo da requisição"
    return problem(
        422,
        _TITLES[422],
        f"Dados inválidos em {fields_text}. Corrija o campo e envie de novo.",
        "request/invalid",
        {"errors": errors},
    )


async def handle_error(request: Request, exc: Exception) -> JSONResponse:
    """The only handler: turns any known error into `problem+json`."""
    if isinstance(exc, AppError):
        return problem(exc.status_code, exc.title, exc.detail, exc.type, exc.extras, exc.headers)
    if isinstance(exc, RequestValidationError):
        return _from_validation(exc)
    if isinstance(exc, StarletteHTTPException):
        return _from_http(exc)
    raise exc


def install_error_handlers(app: FastAPI) -> None:
    for tipo in (AppError, StarletteHTTPException, RequestValidationError):
        app.add_exception_handler(tipo, handle_error)
