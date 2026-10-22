from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import AppError

#: Unidade de trabalho da requisição. `scope="function"`: o commit roda antes da resposta sair, então
#: uma falha no commit vira 500 e não um 200 com dados não gravados (ver docs/refactoring-contract.md).
DbSession = Annotated[AsyncSession, Depends(get_session, scope="function")]


def parse_time(valor: str | None, nome: str = "at") -> datetime | None:
    """Instante ISO 8601 de um parâmetro de consulta; vazio = None (ao vivo)."""
    if not valor:
        return None
    try:
        dt = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AppError(
            422,
            "Parâmetro inválido",
            f"parâmetro '{nome}' inválido (use ISO 8601)",
            "query/invalid_time",
        ) from exc
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
