"""Entrypoint do worker: consome a fila do coletor e processa os arquivos."""

import asyncio
import logging
import os

from app.core.db import get_sessionmaker
from app.core.redis import get_redis
from app.infra import queue
from app.worker.jobs import Processor

log = logging.getLogger("worker")


async def consumer(nome: str, proc: Processor) -> None:
    redis = get_redis()
    while True:
        try:
            item = await redis.brpop(queue.QUEUE, timeout=5)
        except Exception:
            log.exception("[%s] falha ao ler a fila", nome)
            await asyncio.sleep(1)
            continue
        if not item:
            continue
        type_, body, context = queue.read(item[1])
        try:
            await proc.process(type_, body, context)
            await redis.hincrby("worker:metrics", f"ok:{type_}", 1)
        except Exception:
            log.exception(
                "[%s] falha ao processar %s %s", nome, type_, context.get("file") or context.get("url")
            )
            await redis.hincrby("worker:metrics", f"erro:{type_}", 1)


async def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    proc = Processor(get_sessionmaker(), get_redis())
    n = int(os.getenv("WORKER_CONCORRENCIA", "4"))
    log.info("worker iniciado com %d consumidores", n)
    await asyncio.gather(*(consumer(f"c{i}", proc) for i in range(n)))


if __name__ == "__main__":
    asyncio.run(main())
