"""Sign-up and sign-in: who the person is, and whether the password matches.

Failed sign-ins count against the limit per e-mail and per IP (see `login_limit`). A wrong password
and an unknown e-mail get the same message, so the answer does not reveal who has an account.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import hash_password, verify_password
from app.modules.accounts.auth.login_limit import LoginLimiter
from app.modules.accounts.models import User
from app.modules.accounts.schemas import LoginCreate, RegisterCreate


async def register(session: AsyncSession, body: RegisterCreate) -> User:
    email = body.email.lower()
    if (await session.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise AppError(409, "Conflito", "e-mail já cadastrado", "auth/email_taken")
    # The first account ever created is the administrator.
    is_first = (await session.execute(select(func.count()).select_from(User))).scalar_one() == 0
    user = User(email=email, name=body.name, password_hash=hash_password(body.password), is_admin=is_first)
    session.add(user)
    await session.flush()
    return user


async def authenticate(session: AsyncSession, body: LoginCreate, ip: str) -> User:
    email = body.email.lower()
    limiter = LoginLimiter.from_settings()
    await limiter.check(email, ip)
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        await limiter.record_failure(email, ip)
        raise AppError(401, "Não autenticado", "e-mail ou senha inválidos", "auth/invalid_credentials")
    await limiter.reset(email)
    return user
