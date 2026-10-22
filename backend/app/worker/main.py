"""Worker entrypoint: consumes the collector's queue and processes the files."""

import asyncio
import logging

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.redis import get_redis
from app.infra import queue
from app.worker.jobs import Processor

log = logging.getLogger("worker")


async def consumer(name: str, proc: Processor) -> None:
    redis = get_redis()
    while True:
        try:
            item = await queue.dequeue(redis, timeout=5)
        except Exception:
            log.exception("[%s] falha ao ler a fila", name)
            await asyncio.sleep(1)
            continue
        if not item:
            continue
        type_, body, context = item
        try:
            await proc.process(type_, body, context)
            await redis.hincrby("worker:metrics", f"ok:{type_}", 1)
        except Exception:
            log.exception(
                "[%s] falha ao processar %s %s", name, type_, context.get("file") or context.get("url")
            )
            await redis.hincrby("worker:metrics", f"erro:{type_}", 1)


async def main() -> None:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    proc = Processor(get_sessionmaker(), get_redis())
    n = settings.worker_concurrency
    log.info("worker iniciado com %d consumidores", n)
    await asyncio.gather(*(consumer(f"c{i}", proc) for i in range(n)))


if __name__ == "__main__":
    asyncio.run(main())
