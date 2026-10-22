import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.core.deps import SessaoDep
from app.core.security import ler_token
from app.modules.accounts.models import User


async def usuario_opcional(session: SessaoDep, authorization: str | None = Header(None)) -> User | None:
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
        raise HTTPException(401, "não autenticado")
    return u


async def admin(u: Annotated[User, Depends(usuario_atual)]) -> User:
    if not u.is_admin:
        raise HTTPException(403, "apenas administradores")
    return u


UsuarioDep = Annotated[User, Depends(usuario_atual)]
AdminDep = Annotated[User, Depends(admin)]
