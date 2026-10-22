from datetime import datetime
from typing import Annotated

from fastapi import Depends, Query

from app.core.deps import parse_time


def time_param(
    at: str | None = Query(None, description="Instante ISO 8601; vazio = ao vivo"),
) -> datetime | None:
    return parse_time(at, "at")


TimeDep = Annotated[datetime | None, Depends(time_param)]
