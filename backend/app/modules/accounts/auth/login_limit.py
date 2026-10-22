"""Login attempt limit, per e-mail and per IP, over a sliding window.

Each failure is an item in a Redis sorted set, scored by its instant. Reading the counter drops what
left the window and counts the rest: the block ends by itself, with no cleanup job, and holds across
every API process because the state lives in Redis.
"""

import math
import time
import uuid
from collections.abc import Callable

from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.redis import get_redis

#: Clock of the failures (seconds). The tests swap in a fake clock instead of sleeping.
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
        """Raises 429 if the account or the IP already has enough failures inside the window."""
        for key in (_EMAIL_KEY.format(email), _IP_KEY.format(ip)):
            retry_after = await self._retry_after(key)
            if retry_after is not None:
                minutes = max(1, math.ceil(retry_after / 60))
                raise AppError(
                    429,
                    "Muitas tentativas",
                    f"Muitas tentativas de login. Aguarde {minutes} minuto(s) e tente de novo.",
                    "auth/too_many_attempts",
                    headers={"Retry-After": str(retry_after)},
                )

    async def record_failure(self, email: str, ip: str) -> None:
        now = clock()
        for key in (_EMAIL_KEY.format(email), _IP_KEY.format(ip)):
            await self.redis.zadd(key, {f"{now}:{uuid.uuid4().hex}": now})
            await self.redis.expire(key, self.window_seconds)

    async def reset(self, email: str) -> None:
        """A successful login clears only the e-mail counter; the IP counter follows the window."""
        await self.redis.delete(_EMAIL_KEY.format(email))

    async def _retry_after(self, key: str) -> int | None:
        """Seconds until the counter of `key` drops below the limit; None if it is not blocked."""
        now = clock()
        await self.redis.zremrangebyscore(key, 0, now - self.window_seconds)
        count = int(await self.redis.zcard(key))
        excess = count - self.max_failures
        if excess < 0:
            return None
        # With `count` failures, the one at index `excess` (the oldest still counting) leaves first.
        oldest = await self.redis.zrange(key, excess, excess, withscores=True)
        score = float(oldest[0][1])
        return max(1, math.ceil(score + self.window_seconds - now))
