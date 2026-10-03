from redis.asyncio import BlockingConnectionPool, Redis

from app.core.config import get_settings

_redis: Redis | None = None


def criar_redis(url: str, max_conexoes: int = 64) -> Redis:
    """Pool bloqueante: com muitas tarefas concorrentes, espera por conexão em vez de falhar."""
    pool = BlockingConnectionPool.from_url(url, max_connections=max_conexoes, timeout=30, socket_timeout=30,
                                           socket_connect_timeout=10, health_check_interval=30)
    return Redis(connection_pool=pool)


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = criar_redis(get_settings().redis_url)
    return _redis


def configurar_redis(cliente: Redis) -> None:
    global _redis
    _redis = cliente
