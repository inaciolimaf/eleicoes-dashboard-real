"""Cliente HTTP do coletor: limite de taxa, ETag/If-None-Match, memória de 404 e backoff."""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field

import httpx


class TokenBucket:
    """Limita requisições por segundo (um 304 também consome token — regra do TSE)."""

    def __init__(self, taxa: float, capacidade: float | None = None):
        self.taxa = taxa
        self.capacidade = capacidade if capacidade is not None else max(1.0, taxa)
        self.tokens = self.capacidade
        self.ultimo = time.monotonic()
        self._lock = asyncio.Lock()

    async def adquirir(self) -> None:
        async with self._lock:
            while True:
                agora = time.monotonic()
                self.tokens = min(self.capacidade, self.tokens + (agora - self.ultimo) * self.taxa)
                self.ultimo = agora
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
                await asyncio.sleep((1 - self.tokens) / self.taxa)


@dataclass
class Resposta:
    status: int
    corpo: bytes | None
    etag: str | None
    url: str


@dataclass
class Metricas:
    por_status: dict[int, int] = field(default_factory=dict)
    erros_rede: int = 0
    falhas_jws: int = 0
    _janela: deque = field(default_factory=lambda: deque(maxlen=5000))

    def registrar(self, status: int) -> None:
        self.por_status[status] = self.por_status.get(status, 0) + 1
        self._janela.append(time.monotonic())

    def req_por_seg(self, janela: float = 10.0) -> float:
        agora = time.monotonic()
        return round(sum(1 for t in self._janela if agora - t <= janela) / janela, 2)


class Fetcher:
    def __init__(self, max_rps: float, concorrencia: int = 16, cliente: httpx.AsyncClient | None = None,
                 ttl_404: float = 120.0):
        self.bucket = TokenBucket(max_rps)
        self.sem = asyncio.Semaphore(concorrencia)
        self.cliente = cliente or httpx.AsyncClient(timeout=httpx.Timeout(20.0), follow_redirects=True,
                                                    headers={"User-Agent": "eleicoes-dashboard-real/1.0"})
        self.etags: dict[str, str] = {}
        self.nao_encontrados: dict[str, float] = {}
        self.ttl_404 = ttl_404
        self.metricas = Metricas()

    def limpar_404(self) -> None:
        self.nao_encontrados.clear()

    async def get(self, url: str, usar_etag: bool = True, tentativas: int = 3) -> Resposta:
        visto = self.nao_encontrados.get(url)
        if visto is not None and time.monotonic() - visto < self.ttl_404:
            return Resposta(404, None, None, url)
        headers = {}
        if usar_etag and url in self.etags:
            headers["If-None-Match"] = self.etags[url]
        atraso = 1.0
        for tentativa in range(tentativas):
            await self.bucket.adquirir()
            try:
                async with self.sem:
                    r = await self.cliente.get(url, headers=headers)
            except httpx.HTTPError:
                self.metricas.erros_rede += 1
                if tentativa == tentativas - 1:
                    return Resposta(599, None, None, url)
                await asyncio.sleep(atraso)
                atraso *= 2
                continue
            self.metricas.registrar(r.status_code)
            if r.status_code == 304:
                return Resposta(304, None, self.etags.get(url), url)
            if r.status_code == 404:
                self.nao_encontrados[url] = time.monotonic()
                return Resposta(404, None, None, url)
            if r.status_code >= 500 or r.status_code == 429:
                if tentativa == tentativas - 1:
                    return Resposta(r.status_code, None, None, url)
                await asyncio.sleep(atraso)
                atraso *= 2
                continue
            etag = r.headers.get("etag")
            if etag and usar_etag:
                self.etags[url] = etag
            return Resposta(r.status_code, r.content, etag, url)
        return Resposta(599, None, None, url)

    async def fechar(self) -> None:
        await self.cliente.aclose()
