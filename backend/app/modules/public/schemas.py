from fastapi import Query
from pydantic import BaseModel


class FiltroEleicao(BaseModel):
    """Cargo e turno da consulta."""

    cargo: int = 1
    turno: int = 1


class FiltroEventos(BaseModel):
    """Filtro da lista de eventos."""

    turno: int = 1
    desde: str | None = None
    ate: str | None = None
    limite: int = Query(100, ge=1, le=1000)
    tipos: str | None = None
    cargo: int | None = None
    nivel: str | None = None
    id_: str | None = Query(None, alias="id")


class FiltroExport(BaseModel):
    """O que exportar e em que formato."""

    recurso: str = "resultados"
    formato: str = "csv"
    cargo: int = 1
    turno: int = 1
    nivel: str = "br"
    id_: str = Query("br", alias="id")
    filhos: str | None = None
