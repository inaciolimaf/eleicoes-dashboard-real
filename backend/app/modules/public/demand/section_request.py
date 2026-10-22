"""Opening a polling place or a section asks the collector to fetch its ballot boxes (on-demand mode)."""

import logging

from app.core.redis import get_redis
from app.modules.ballot_reports import demand

log = logging.getLogger(__name__)


async def request_sections(election_round: int, level: str, geo_id: str) -> None:
    try:
        await demand.register(get_redis(), election_round, level, geo_id)
    except Exception:
        # The request is only a signal for the collector: it never breaks the read.
        log.warning("could not register the on-demand section request: %s", geo_id, exc_info=True)
