"""Helpers shared by the parsers of every file kind."""

from typing import Any

from app.infra.tse.numbers import date_time


def generation_id(data: dict[str, Any]) -> str:
    """Generation id of the file.

    Without `idg` in the file, the generation date and time is used: otherwise every generation would have
    idg 0 and only the first one would be saved (the snapshot is unique per idg).
    """
    generation_id = str(data.get("idg") or "").strip()
    if generation_id.isdigit():
        return generation_id
    generated = date_time(data.get("dg"), data.get("hg")) or date_time(data.get("dt"), data.get("ht"))
    return str(int(generated.timestamp())) if generated else ""
