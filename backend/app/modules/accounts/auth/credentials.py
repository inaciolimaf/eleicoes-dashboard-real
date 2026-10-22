"""Cadastro e login: quem é a pessoa e se a senha confere.

Falhas de login contam no limite por e-mail e por IP (ver `login_limit`). Erro de senha e e-mail
inexistente saem com a mesma mensagem, para não revelar quem tem conta.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import hash_senha, verificar_senha
from app.modules.accounts.auth.login_limit import LoginLimiter
from app.modules.accounts.models import User
from app.modules.accounts.schemas import LoginCreate, RegisterCreate


async def register(session: AsyncSession, dados: RegisterCreate) -> User:
    email = dados.email.lower()
    if (await session.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise AppError(409, "Conflito", "e-mail já cadastrado", "auth/email_taken")
    primeiro = (await session.execute(select(func.count()).select_from(User))).scalar_one() == 0
    u = User(email=email, name=dados.name, password_hash=hash_senha(dados.password), is_admin=primeiro)
    session.add(u)
    await session.flush()
    return u


async def authenticate(session: AsyncSession, dados: LoginCreate, ip: str) -> User:
    email = dados.email.lower()
    limiter = LoginLimiter.from_settings()
    await limiter.check(email, ip)
    u = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if u is None or not verificar_senha(dados.password, u.password_hash):
        await limiter.record_failure(email, ip)
        raise AppError(401, "Não autenticado", "e-mail ou senha inválidos", "auth/invalid_credentials")
    await limiter.reset(email)
    return u
