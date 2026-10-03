import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import ler_token
from app.models import Usuario
from app.services.recortes import Recorte, RecorteInvalido, parse

SessaoDep = Annotated[AsyncSession, Depends(get_session)]


def parse_t(t: str | None) -> datetime | None:
    if not t:
        return None
    try:
        dt = datetime.fromisoformat(t.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(422, "parâmetro t inválido (use ISO 8601)") from exc
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def tempo(t: str | None = Query(None, description="Instante ISO 8601; vazio = ao vivo")) -> datetime | None:
    return parse_t(t)


TempoDep = Annotated[datetime | None, Depends(tempo)]


def recorte(nivel: str = Query("br"), id: str = Query("br")) -> Recorte:
    try:
        return parse(id, nivel)
    except RecorteInvalido as exc:
        raise HTTPException(422, f"recorte inválido: {exc}") from exc


RecorteDep = Annotated[Recorte, Depends(recorte)]


async def usuario_opcional(session: SessaoDep, authorization: str | None = Header(None)) -> Usuario | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    uid = ler_token(authorization.split(" ", 1)[1])
    if not uid:
        return None
    try:
        return await session.get(Usuario, uuid.UUID(uid))
    except ValueError:
        return None


async def usuario_atual(u: Annotated[Usuario | None, Depends(usuario_opcional)]) -> Usuario:
    if u is None:
        raise HTTPException(401, "não autenticado")
    return u


async def admin(u: Annotated[Usuario, Depends(usuario_atual)]) -> Usuario:
    if not u.is_admin:
        raise HTTPException(403, "apenas administradores")
    return u


UsuarioDep = Annotated[Usuario, Depends(usuario_atual)]
AdminDep = Annotated[Usuario, Depends(admin)]
