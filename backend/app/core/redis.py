from redis.asyncio import BlockingConnectionPool, Redis

from app.core.config import get_settings

_redis: Redis | None = None


def create_redis(url: str, max_connections: int = 64) -> Redis:
    """Blocking pool: with many concurrent tasks it waits for a connection instead of failing."""
    pool = BlockingConnectionPool.from_url(
        url,
        max_connections=max_connections,
        timeout=30,
        socket_timeout=30,
        socket_connect_timeout=10,
        health_check_interval=30,
    )
    return Redis(connection_pool=pool)


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = create_redis(get_settings().redis_url)
    return _redis


def configure_redis(client: Redis) -> None:
    global _redis
    _redis = client


# TEMPORARY: removed by the main agent after integration (tests/conftest.py still uses the old names).
criar_redis = create_redis
configurar_redis = configure_redis
