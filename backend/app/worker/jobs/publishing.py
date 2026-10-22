"""Realtime messages of one job.

A job collects its messages with `Outbox` while it works inside the unit of work, and publishes
them only after the commit: a rolled-back job must not announce data that was never stored.
"""

from __future__ import annotations

from redis.asyncio import Redis

from app.infra.realtime import topics
from app.modules.alerts import Alert


class Outbox:
    def __init__(self) -> None:
        self._messages: list[tuple[str, str, object]] = []

    def add(self, topic: str, type_: str, data: object) -> None:
        self._messages.append((topic, type_, data))

    def add_alert(self, alert: Alert, text: tuple[str, str]) -> None:
        title, description = text
        self.add(
            topics.user(str(alert.user_id)),
            "alert",
            {"title": title, "description": description, "alert_id": str(alert.id)},
        )

    async def publish(self, redis: Redis) -> None:
        for topic, type_, data in self._messages:
            await topics.publish(redis, topic, type_, data)
