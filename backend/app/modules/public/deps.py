from datetime import datetime
from typing import Annotated

from fastapi import Depends, Query

from app.core.deps import parse_t


def tempo(t: str | None = Query(None, description="Instante ISO 8601; vazio = ao vivo")) -> datetime | None:
    return parse_t(t)


TempoDep = Annotated[datetime | None, Depends(tempo)]
