"""Entrypoint do container `collector`."""

import asyncio
import logging

from app.collector.coletor import Coletor
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.redis import get_redis


async def main() -> None:
    s = get_settings()
    logging.basicConfig(level=s.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    await Coletor(s, get_sessionmaker(), get_redis()).executar()


if __name__ == "__main__":
    asyncio.run(main())
