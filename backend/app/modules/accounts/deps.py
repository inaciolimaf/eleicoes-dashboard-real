import uuid
from typing import Annotated

from fastapi import Depends, Header

from app.core.deps import DbSession
from app.core.errors import AppError
from app.core.security import ler_token
from app.modules.accounts.models import User


async def usuario_opcional(session: DbSession, authorization: str | None = Header(None)) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    uid = ler_token(authorization.split(" ", 1)[1])
    if not uid:
        return None
    try:
        return await session.get(User, uuid.UUID(uid))
    except ValueError:
        return None


async def usuario_atual(u: Annotated[User | None, Depends(usuario_opcional)]) -> User:
    if u is None:
        raise AppError(401, "Não autenticado", "não autenticado", "auth/required")
    return u


async def admin(u: Annotated[User, Depends(usuario_atual)]) -> User:
    if not u.is_admin:
        raise AppError(403, "Acesso negado", "apenas administradores", "auth/admin_required")
    return u


UsuarioDep = Annotated[User, Depends(usuario_atual)]
AdminDep = Annotated[User, Depends(admin)]
