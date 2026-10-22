from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session

SessaoDep = Annotated[AsyncSession, Depends(get_session)]


def parse_t(t: str | None) -> datetime | None:
    if not t:
        return None
    try:
        dt = datetime.fromisoformat(t.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(422, "parâmetro t inválido (use ISO 8601)") from exc
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
