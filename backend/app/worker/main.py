"""Worker entrypoint: consumes the collector's queue and processes the files."""

import asyncio

import structlog

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.log import configure_logging
from app.core.redis import get_redis
from app.infra import queue
from app.worker.jobs import Processor

log = structlog.get_logger("worker")


async def consumer(name: str, proc: Processor) -> None:
    redis = get_redis()
    while True:
        try:
            item = await queue.dequeue(redis, timeout=5)
        except Exception as error:
            log.exception("worker.queue_read_failed", consumer=name, error=str(error)[:300])
            await asyncio.sleep(1)
            continue
        if not item:
            continue
        type_, body, context = item
        try:
            await proc.process(type_, body, context)
            await redis.hincrby("worker:metrics", f"ok:{type_}", 1)
        except Exception as error:
            log.exception(
                "worker.job_failed",
                consumer=name,
                type=type_,
                source=context.get("file") or context.get("url"),
                error=str(error)[:300],
            )
            await redis.hincrby("worker:metrics", f"erro:{type_}", 1)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings)
    proc = Processor(get_sessionmaker(), get_redis())
    n = settings.worker_concurrency
    log.info("worker.started", consumers=n)
    await asyncio.gather(*(consumer(f"c{i}", proc) for i in range(n)))


if __name__ == "__main__":
    asyncio.run(main())
