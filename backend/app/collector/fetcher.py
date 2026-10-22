"""HTTP client of the collector: rate limit, ETag/If-None-Match, 404 memory and backoff."""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field

import httpx


class TokenBucket:
    """Limits requests per second (a 304 also consumes a token, as the TSE counts it).

    High-priority requests go first: while one waits, the low-priority ones do not take the token.
    """

    def __init__(self, rate: float, capacity: float | None = None) -> None:
        self.rate = rate
        # Short burst (10% of the rate): without it, a full bucket plus the sustained rate would
        # almost double the number of requests in the same second.
        self.capacity = capacity if capacity is not None else max(1.0, rate * 0.1)
        self.tokens = self.capacity
        self.last = time.monotonic()
        self._lock_high = asyncio.Lock()
        self._lock_low = asyncio.Lock()

    async def acquire(self, high_priority: bool = False) -> None:
        async with self._lock_high if high_priority else self._lock_low:
            while True:
                if not high_priority and self._lock_high.locked():
                    await asyncio.sleep(1 / self.rate)
                    continue
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.rate)
                self.last = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
                await asyncio.sleep((1 - self.tokens) / self.rate)


@dataclass
class Response:
    status: int
    body: bytes | None
    etag: str | None
    url: str


@dataclass
class Metrics:
    by_status: dict[int, int] = field(default_factory=dict)
    network_errors: int = 0
    jws_failures: int = 0
    _window: deque[float] = field(default_factory=lambda: deque(maxlen=5000))

    def record(self, status: int) -> None:
        self.by_status[status] = self.by_status.get(status, 0) + 1
        self._window.append(time.monotonic())

    def requests_per_second(self, window: float = 10.0) -> float:
        now = time.monotonic()
        return round(sum(1 for t in self._window if now - t <= window) / window, 2)


class Fetcher:
    def __init__(
        self,
        max_rps: float,
        concurrency: int = 16,
        client: httpx.AsyncClient | None = None,
        ttl_404: float = 120.0,
    ) -> None:
        self.bucket = TokenBucket(max_rps)
        self.semaphore = asyncio.Semaphore(concurrency)
        self.high_semaphore = asyncio.Semaphore(max(4, concurrency // 3))
        self.client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(20.0),
            follow_redirects=True,
            headers={"User-Agent": "eleicoes-dashboard-real/1.0"},
        )
        self.etags: dict[str, str] = {}
        self.not_found: dict[str, float] = {}
        self.ttl_404 = ttl_404
        self.metrics = Metrics()
        self.pause_until = 0.0

    def clear_404(self) -> None:
        self.not_found.clear()

    async def get(
        self, url: str, use_etag: bool = True, attempts: int = 3, high_priority: bool = True
    ) -> Response:
        seen = self.not_found.get(url)
        if seen is not None and time.monotonic() - seen < self.ttl_404:
            return Response(404, None, None, url)
        headers: dict[str, str] = {}
        if use_etag and url in self.etags:
            headers["If-None-Match"] = self.etags[url]
        delay = 1.0
        for attempt in range(attempts):
            await self._wait_for_pause()
            await self.bucket.acquire(high_priority)
            last = attempt == attempts - 1
            try:
                r = await self._send(url, headers, high_priority)
            except httpx.HTTPError:
                self.metrics.network_errors += 1
                if last:
                    return Response(599, None, None, url)
                await asyncio.sleep(delay)
                delay *= 2
                continue
            self.metrics.record(r.status_code)
            outcome = self._interpret(url, r, use_etag, last)
            if outcome is not None:
                return outcome
            await asyncio.sleep(delay)
            delay *= 2
        return Response(599, None, None, url)

    async def _wait_for_pause(self) -> None:
        wait = self.pause_until - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)

    async def _send(self, url: str, headers: dict[str, str], high_priority: bool) -> httpx.Response:
        async with self.high_semaphore if high_priority else self.semaphore:
            return await self.client.get(url, headers=headers)

    def _interpret(self, url: str, r: httpx.Response, use_etag: bool, last: bool) -> Response | None:
        """The final answer for this response, or None when the request should be retried."""
        if r.status_code == 304:
            return Response(304, None, self.etags.get(url), url)
        if r.status_code == 404:
            self.not_found[url] = time.monotonic()
            return Response(404, None, None, url)
        if r.status_code == 429:
            # Too many requests: holds the whole collector for a while instead of insisting.
            self.pause_until = max(self.pause_until, time.monotonic() + 30.0)
        if r.status_code >= 500 or r.status_code == 429:
            return Response(r.status_code, None, None, url) if last else None
        etag = r.headers.get("etag")
        if etag and use_etag:
            self.etags[url] = etag
        return Response(r.status_code, r.content, etag, url)

    async def close(self) -> None:
        await self.client.aclose()
