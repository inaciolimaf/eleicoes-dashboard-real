from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

_ph = PasswordHasher()


def hash_senha(senha: str) -> str:
    return _ph.hash(senha)


def verificar_senha(senha: str, hash_: str) -> bool:
    try:
        return _ph.verify(hash_, senha)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def criar_token(usuario_id: str) -> str:
    s = get_settings()
    agora = datetime.now(UTC)
    payload = {"sub": usuario_id, "iat": agora, "exp": agora + timedelta(minutes=s.jwt_expira_min)}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def ler_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None
