"""Entrypoint of the `collector` container."""

import asyncio
import logging

from app.collector.collector import Collector
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.log import configure_logging
from app.core.redis import get_redis


async def main() -> None:
    settings = get_settings()
    configure_logging(settings)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    await Collector(settings, get_sessionmaker(), get_redis()).run()


if __name__ == "__main__":
    asyncio.run(main())
