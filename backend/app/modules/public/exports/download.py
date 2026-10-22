"""Export of results and children as a file: CSV (semicolon-separated, UTF-8 with BOM) or JSON."""

import csv
import io
from datetime import datetime
from typing import Any

import orjson
from fastapi import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.modules.geography import GeoArea, GeoAreaInvalid, parse
from app.modules.public.exports.rows import children_rows, results_rows
from app.modules.public.schemas import ExportFilter
from app.modules.results import queries as results


async def export_data(session: AsyncSession, at: datetime | None, export_filter: ExportFilter) -> Response:
    area = _parse_area(export_filter)
    if export_filter.resource == "results":
        data = await results.montar_resultado(session, export_filter.round, export_filter.office, area, at)
        rows, columns = results_rows(data, area.id)
    elif export_filter.resource == "children":
        data = await results.filhos(
            session, export_filter.round, export_filter.office, area, at, export_filter.child_level
        )
        rows, columns = children_rows(data)
    else:
        raise AppError(422, "Parâmetro inválido", "recurso inválido", "export/invalid_resource")
    name = f"{export_filter.resource}-{export_filter.office}-{area.id}"
    if export_filter.format == "json":
        return Response(
            orjson.dumps(data),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{name}.json"'},
        )
    return Response(
        _to_csv(rows, columns).encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}.csv"'},
    )


def _parse_area(export_filter: ExportFilter) -> GeoArea:
    try:
        return parse(export_filter.id, export_filter.level)
    except GeoAreaInvalid as exc:
        raise AppError(422, "Parâmetro inválido", "recorte inválido", "geo_area/invalid") from exc


def _to_csv(rows: list[dict[str, Any]], columns: list[str]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore", delimiter=";")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()
