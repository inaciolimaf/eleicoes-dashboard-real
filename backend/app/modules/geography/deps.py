from typing import Annotated

from fastapi import Depends, HTTPException, Query

from app.modules.geography.geo_area import Recorte, RecorteInvalido, parse


def recorte(nivel: str = Query("br"), id_: str = Query("br", alias="id")) -> Recorte:
    try:
        return parse(id_, nivel)
    except RecorteInvalido as exc:
        raise HTTPException(422, f"recorte inválido: {exc}") from exc


RecorteDep = Annotated[Recorte, Depends(recorte)]
