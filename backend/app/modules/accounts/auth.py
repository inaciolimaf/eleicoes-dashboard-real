"""Cadastro, login e o usuário atual."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import criar_token, hash_senha, verificar_senha
from app.modules.accounts.models import User
from app.modules.accounts.schemas import LoginCreate, RegisterCreate, TokenDto, UserDto


def user_dto(u: User) -> UserDto:
    return UserDto(id=str(u.id), email=u.email, name=u.name, is_admin=u.is_admin)


def token_dto(u: User) -> TokenDto:
    return TokenDto(
        access_token=criar_token(str(u.id)),
        token_type="bearer",  # noqa: S106 - tipo do token OAuth2, não é senha
        user=user_dto(u),
    )


async def register(session: AsyncSession, dados: RegisterCreate) -> User:
    email = dados.email.lower()
    if (await session.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise AppError(409, "Conflito", "e-mail já cadastrado", "auth/email_taken")
    primeiro = (await session.execute(select(func.count()).select_from(User))).scalar_one() == 0
    u = User(email=email, name=dados.name, password_hash=hash_senha(dados.password), is_admin=primeiro)
    session.add(u)
    await session.flush()
    return u


async def authenticate(session: AsyncSession, dados: LoginCreate) -> User:
    u = (await session.execute(select(User).where(User.email == dados.email.lower()))).scalar_one_or_none()
    if u is None or not verificar_senha(dados.password, u.password_hash):
        raise AppError(401, "Não autenticado", "e-mail ou senha inválidos", "auth/invalid_credentials")
    return u
