"""Downloads one TSE file: signature check (JWS) with fallback to the plain JSON, and the raw archive.

Inheritance order of the steps: request -> catalog -> sections -> tracking, results, demand.
"""

from __future__ import annotations

import time
from pathlib import Path

from app.collector.steps.base import CollectorBase, log
from app.infra.tse import jws


class RequestSteps(CollectorBase):
    def _archive(self, url: str, idg: str | None, body: bytes) -> None:
        """Keeps the raw file in `DIR_BRUTOS`, named by the TSE generation id; I/O errors are ignored."""
        try:
            rel = url.split("://", 1)[-1].split("/", 1)[-1]
            destination = Path(self.settings.raw_dir) / self.settings.tse_environment / rel
            destination = destination.with_name(f"{destination.name}.{idg or int(time.time())}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(body)
        except OSError:
            pass

    async def fetch_file(
        self, url_json: str, archive: bool = True, high_priority: bool = True
    ) -> tuple[int, bytes | None, bool]:
        """Fetches the .jws (checking its signature) and falls back to the .json when there is no .jws.

        Returns (status, body, verified): `verified` is True only when the signature was checked.
        """
        if self.settings.tse_use_jws and not self.jws_disabled and url_json.endswith(".json"):
            url = url_json[:-5] + ".jws"
            r = await self.fetcher.get(url, high_priority=high_priority)
            if r.status == 200 and r.body is not None:
                if archive:
                    self._archive(url, r.etag, r.body)
                verified = self._verify_jws(url, r.body)
                if verified is not None:
                    return verified
            elif r.status != 404:
                return r.status, None, False
        r = await self.fetcher.get(url_json, high_priority=high_priority)
        if r.status == 200 and r.body is not None and archive:
            self._archive(url_json, r.etag, r.body)
        return r.status, r.body, False

    def _verify_jws(self, url: str, body: bytes) -> tuple[int, bytes, bool] | None:
        """The payload of the signed file, or None when its key does not match (the caller uses the .json)."""
        if self.signing_key is None:
            return 200, jws.decodificar_sem_verificar(body.decode())[1], False
        try:
            return 200, jws.verificar(body.decode(), self.signing_key), True
        except jws.ErroJWS as exc:
            # A key or kid other than the expected one: instead of dropping the result (and the site
            # stopping its updates), use the .json, without the verified mark.
            self.fetcher.metrics.jws_failures += 1
            self.fetcher.etags.pop(url, None)
            self.jws_disabled = True
            log.error("JWS inválido em %s: %s — coletando pelo .json sem verificar assinatura", url, exc)
            return None
