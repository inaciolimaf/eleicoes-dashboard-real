import uuid
from typing import Annotated

from fastapi import Depends, Header

from app.core.deps import DbSession
from app.core.errors import AppError
from app.core.security import read_token
from app.modules.accounts.models import User


async def optional_user(session: DbSession, authorization: str | None = Header(None)) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    user_id = read_token(authorization.split(" ", 1)[1])
    if not user_id:
        return None
    try:
        return await session.get(User, uuid.UUID(user_id))
    except ValueError:
        return None


async def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise AppError(401, "Não autenticado", "não autenticado", "auth/required")
    return user


async def require_admin(user: Annotated[User, Depends(current_user)]) -> User:
    if not user.is_admin:
        raise AppError(403, "Acesso negado", "apenas administradores", "auth/admin_required")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_admin)]
