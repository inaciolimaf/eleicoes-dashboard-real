from typing import Annotated

from fastapi import Depends, Query

from app.core.errors import AppError
from app.modules.geography.geo_area.area import GeoArea, GeoAreaInvalid, parse


def geo_area(
    level: str = Query("country", description="country, state, municipality, zone, polling_place ou section"),
    id: str = Query("br", description="Id da área: br, sp, sp71072, sp71072-z0001..."),  # noqa: A002
) -> GeoArea:
    try:
        return parse(id, level)
    except GeoAreaInvalid as exc:
        raise AppError(422, "Parâmetro inválido", f"recorte inválido: {exc}", "geo_area/invalid") from exc


GeoAreaDep = Annotated[GeoArea, Depends(geo_area)]
