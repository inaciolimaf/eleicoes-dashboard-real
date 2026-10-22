from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import AppError

#: The request's unit of work. `scope="function"`: the commit runs before the response leaves, so a
#: failing commit becomes a 500 and not a 200 with data that was never saved (see the refactoring contract).
DbSession = Annotated[AsyncSession, Depends(get_session, scope="function")]


def parse_time(value: str | None, name: str = "at") -> datetime | None:
    """ISO 8601 instant of a query parameter; empty means None (live)."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AppError(
            422,
            "Parâmetro inválido",
            f"parâmetro '{name}' inválido (use ISO 8601)",
            "query/invalid_time",
        ) from exc
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
