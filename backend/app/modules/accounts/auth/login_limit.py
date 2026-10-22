"""Limite de tentativas de login, por e-mail e por IP, numa janela deslizante.

Cada falha é um item num sorted set do Redis, com o instante como score. Ler o contador é tirar
o que saiu da janela e contar o resto: o bloqueio acaba sozinho, sem tarefa de limpeza, e vale
para todos os processos da API porque o estado está no Redis.
"""

import math
import time
import uuid
from collections.abc import Callable

from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.redis import get_redis

#: Relógio das falhas (segundos). Os testes trocam por um relógio falso em vez de dormir.
clock: Callable[[], float] = time.time

_EMAIL_KEY = "login:failures:email:{}"
_IP_KEY = "login:failures:ip:{}"


class LoginLimiter:
    def __init__(self, redis: Redis, max_failures: int, window_seconds: int) -> None:
        self.redis = redis
        self.max_failures = max_failures
        self.window_seconds = window_seconds

    @classmethod
    def from_settings(cls) -> "LoginLimiter":
        s = get_settings()
        return cls(get_redis(), s.login_max_failures, s.login_window_seconds)

    async def check(self, email: str, ip: str) -> None:
        """Levanta 429 se a conta ou o IP já tem falhas suficientes dentro da janela."""
        for key in (_EMAIL_KEY.format(email), _IP_KEY.format(ip)):
            retry_after = await self._retry_after(key)
            if retry_after is not None:
                minutos = max(1, math.ceil(retry_after / 60))
                raise AppError(
                    429,
                    "Muitas tentativas",
                    f"Muitas tentativas de login. Aguarde {minutos} minuto(s) e tente de novo.",
                    "auth/too_many_attempts",
                    headers={"Retry-After": str(retry_after)},
                )

    async def record_failure(self, email: str, ip: str) -> None:
        now = clock()
        for key in (_EMAIL_KEY.format(email), _IP_KEY.format(ip)):
            await self.redis.zadd(key, {f"{now}:{uuid.uuid4().hex}": now})
            await self.redis.expire(key, self.window_seconds)

    async def reset(self, email: str) -> None:
        """Sucesso no login zera só o contador do e-mail; o do IP segue a janela."""
        await self.redis.delete(_EMAIL_KEY.format(email))

    async def _retry_after(self, key: str) -> int | None:
        """Segundos até o contador de `key` voltar abaixo do limite; None se não está bloqueado."""
        now = clock()
        await self.redis.zremrangebyscore(key, 0, now - self.window_seconds)
        count = int(await self.redis.zcard(key))
        excess = count - self.max_failures
        if excess < 0:
            return None
        # Com `count` falhas, a de índice `excess` (a mais antiga que ainda conta) é a que sai primeiro.
        oldest = await self.redis.zrange(key, excess, excess, withscores=True)
        score = float(oldest[0][1])
        return max(1, math.ceil(score + self.window_seconds - now))
