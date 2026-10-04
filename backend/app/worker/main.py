"""Entrypoint do worker: consome a fila do coletor e processa os arquivos."""

import asyncio
import logging
import os

from app.core.db import get_sessionmaker
from app.core.redis import get_redis
from app.worker import fila
from app.worker.jobs import Processador

log = logging.getLogger("worker")


async def consumidor(nome: str, proc: Processador) -> None:
    redis = get_redis()
    while True:
        try:
            item = await fila.retirar(redis, timeout=5)
        except Exception:
            log.exception("[%s] falha ao ler a fila", nome)
            await asyncio.sleep(1)
            continue
        if not item:
            continue
        tipo, corpo, ctx = item
        try:
            await proc.processar(tipo, corpo, ctx)
            await redis.hincrby("worker:metricas", f"ok:{tipo}", 1)
        except Exception:
            log.exception("[%s] falha ao processar %s %s", nome, tipo, ctx.get("arquivo") or ctx.get("url"))
            await redis.hincrby("worker:metricas", f"erro:{tipo}", 1)


async def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    proc = Processador(get_sessionmaker(), get_redis())
    n = int(os.getenv("WORKER_CONCORRENCIA", "4"))
    log.info("worker iniciado com %d consumidores", n)
    await asyncio.gather(*(consumidor(f"c{i}", proc) for i in range(n)))


if __name__ == "__main__":
    asyncio.run(main())
