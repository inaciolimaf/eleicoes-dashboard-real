"""Polling sections: the auxiliary file, then the ballot box report (BU), sent to the worker."""

from __future__ import annotations

import contextlib
import time
from typing import Any

import orjson

from app.collector.steps.base import SectionRef, log, now_iso
from app.collector.steps.catalog import CatalogSteps
from app.infra import queue
from app.infra.tse.parsers import ArquivoUrnaTSE, parse_auxiliar


class SectionSteps(CatalogSteps):
    def schedule_municipality_sections(
        self, round_number: int, uf: str, municipality_code: int, municipality_id: str
    ) -> None:
        """Queues the sections of a municipality (mode "all sections"); the watched ones go first."""
        priority = 0 if municipality_id in self.watched else 2
        for zone, section in self.sections_by_municipality.get(municipality_id, []):
            ref = SectionRef(round_number, uf, municipality_code, zone, section)
            if self._section_done(ref.id) or ref.id in self.pending_sections:
                continue
            self.pending_sections.add(ref.id)
            self.section_queue.put_nowait(
                (priority, self._next_order(), round_number, uf, municipality_code, zone, section)
            )

    async def process_section(
        self,
        round_number: int,
        uf: str,
        municipality_code: int,
        zone: int,
        section: int,
        high_priority: bool = False,
    ) -> None:
        assert self.urls is not None
        ref = SectionRef(round_number, uf, municipality_code, zone, section)
        self.section_attempts[ref.id] = time.monotonic()
        diag: dict[str, Any] = {"at": now_iso(), "round": round_number, "high_priority": high_priority}
        try:
            await self._process_section(ref, high_priority, diag)
        except Exception as exc:
            diag["error"] = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            log.info("seção %s: %s", ref.id, diag)
            with contextlib.suppress(Exception):
                await self.redis.set(f"diag:section:{ref.id}", orjson.dumps(diag), ex=3600)

    async def _process_section(self, ref: SectionRef, high_priority: bool, diag: dict[str, Any]) -> None:
        assert self.urls is not None
        url = self.urls.auxiliar_secao(ref.uf, ref.municipality, ref.zone, ref.section)
        # No ETag: with one, a BU that failed once would keep the auxiliary answering 304 and the
        # section would never be downloaded
        r = await self.fetcher.get(url, use_etag=False, high_priority=high_priority)
        diag.update(aux_url=url, aux_status=r.status)
        if r.status != 200 or not r.body:
            diag["step"] = "auxiliar indisponível"
            return
        aux = parse_auxiliar(orjson.loads(r.body))
        diag["aux"] = {
            "status": aux.status,
            "urns": [{"hash": u.hash[:16], "status": u.status, "files": u.arquivos} for u in aux.urnas],
        }
        ballot_box = aux.urna_totalizada()
        if ballot_box is None:
            diag["step"] = "nenhuma urna totalizada com .bu no auxiliar"
            return
        await self._fetch_ballot(ref, ballot_box, high_priority, diag)

    async def _fetch_ballot(
        self, ref: SectionRef, ballot_box: ArquivoUrnaTSE, high_priority: bool, diag: dict[str, Any]
    ) -> None:
        assert self.urls is not None
        name = ballot_box.nome_bu()
        assert name is not None
        url_bu = self.urls.arquivo_urna(
            ref.uf, ref.municipality, ref.zone, ref.section, ballot_box.hash, name
        )
        ballot_response = await self.fetcher.get(url_bu, use_etag=False, high_priority=high_priority)
        diag.update(bu_url=url_bu, bu_status=ballot_response.status)
        if ballot_response.status != 200 or not ballot_response.body:
            diag["step"] = "BU indisponível"
            return
        self._archive(url_bu, ballot_box.hash[:16], ballot_response.body)
        # Marked only for a while: if the worker fails, the section is tried again (the database is the truth)
        self.sections_done[ref.id] = time.monotonic()
        await queue.enqueue(
            self.redis,
            queue.TYPE_BALLOT,
            ballot_response.body,
            high_priority=high_priority,
            round=ref.round,
            state_code=ref.uf,
            hash=ballot_box.hash,
            status=ballot_box.status,
            polling_section_id=ref.id,
            tallied_at=ballot_box.recebido_em.isoformat() if ballot_box.recebido_em else None,
            url=url_bu,
        )
        diag["step"] = "BU enviado ao worker"
