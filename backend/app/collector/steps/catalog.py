"""Catalog and reference data: elections, municipalities, polling places, sections of a state."""

from __future__ import annotations

from pathlib import Path

import orjson
from sqlalchemy import func, select

from app.collector.steps.base import log
from app.collector.steps.request import RequestSteps
from app.core.db import unit_of_work
from app.infra.tse.catalog import parse_catalogo
from app.infra.tse.parsers import parse_municipios, parse_secoes
from app.infra.tse.urls import MontadorUrls
from app.modules.elections import Election
from app.modules.geography import PollingPlace
from app.modules.results import ingestion

MUNICIPALITIES_FILE = Path(__file__).resolve().parents[2] / "data" / "municipios.json"


class CatalogSteps(RequestSteps):
    async def refresh_catalog(self) -> bool:
        """Reads the TSE catalog; on a new generation, reloads the municipalities and polling places."""
        url = f"{self.settings.tse_base_url.rstrip('/')}/comum/config/ele-c.json"
        status, body, _ = await self.fetch_file(url)
        if status == 304 or body is None:
            return False
        catalog = parse_catalogo(orjson.loads(body))
        event = catalog.pleito_atual()
        if event is None:
            return False
        is_new = self.catalog is None or self.catalog.idg != catalog.idg
        self.catalog = catalog
        self.urls = MontadorUrls(self.settings.tse_base_url, catalog.templates, event.ciclo, event.cd)
        async with unit_of_work(self.sessionmaker) as session:
            self.elections = await ingestion.ingerir_catalogo(session, catalog, self.settings.tse_ambiente)
        if is_new:
            self.fetcher.clear_404()
            await self.load_municipalities()
            await self.load_polling_places()
        log.info(
            "catálogo: ciclo=%s pleito=%s eleições=%s",
            event.ciclo,
            event.cd,
            [e.election_code for e in self.elections],
        )
        return True

    def rounds(self) -> list[int]:
        return sorted({e.round for e in self.elections})

    def election_for_office(self, round_number: int, office_code: int) -> Election | None:
        for e in self.elections:
            if e.round == round_number and any(c.office_code == office_code for c in e.offices):
                return e
        return None

    def election_of_round(self, round_number: int) -> Election | None:
        """The election that represents the round: the one with the President, or else the first one."""
        found = self.election_for_office(round_number, 1)
        return found or next((x for x in self.elections if x.round == round_number), None)

    async def round_published(self, round_number: int) -> bool:
        """Avoids a flood of 404s (which can block the IP): tests a sentinel file first."""
        assert self.urls is not None
        e = self.election_of_round(round_number)
        if e is None:
            return False
        office_code = 1 if any(c.office_code == 1 for c in e.offices) else e.offices[0].office_code
        url = self.urls.resultado(e.election_code, office_code, "br" if office_code == 1 else "sp")
        status, _, _ = await self.fetch_file(url, archive=False)
        return status in (200, 304)

    async def load_municipalities(self) -> None:
        assert self.urls is not None
        e = self.election_for_office(1, 1) or (self.elections[0] if self.elections else None)
        if e is None:
            return
        _status, body, _ = await self.fetch_file(self.urls.municipios(e.election_code))
        if body is None:
            return
        listed = parse_municipios(orjson.loads(body))
        coords = {
            m["ibge"]: (m["lat"], m["lon"], m["nome"]) for m in orjson.loads(MUNICIPALITIES_FILE.read_bytes())
        }
        async with unit_of_work(self.sessionmaker) as session:
            await ingestion.ingerir_municipios(session, listed, coords)
        self.municipalities = {
            f"{m.uf}{m.cd:05d}": {"uf": m.uf, "code": m.cd, "zonas": m.zonas} for m in listed
        }
        log.info("municípios carregados: %d", len(self.municipalities))

    async def load_polling_places(self) -> None:
        async with self.sessionmaker() as session:
            count = (await session.execute(select(func.count()).select_from(PollingPlace))).scalar_one()
        if count > 0 or not self.settings.locais_votacao_url:
            return
        r = await self.fetcher.get(self.settings.locais_votacao_url, use_etag=False)
        if r.status != 200 or not r.body:
            log.warning("não foi possível baixar locais de votação (%s)", r.status)
            return
        async with unit_of_work(self.sessionmaker) as session:
            total = await ingestion.importar_locais(session, ingestion.ler_csv_locais(r.body))
        log.info("locais de votação importados: %d", total)

    async def load_sections_of_state(self, uf: str) -> None:
        if uf in self.states_with_sections or self.urls is None:
            return
        self.states_with_sections.add(uf)
        _status, body, _ = await self.fetch_file(self.urls.secoes(uf), archive=False, high_priority=False)
        if body is None:
            self.states_with_sections.discard(uf)
            return
        listed = parse_secoes(orjson.loads(body))
        async with unit_of_work(self.sessionmaker) as session:
            await ingestion.ingerir_secoes(session, listed)
        for s in listed:
            self.sections_by_municipality.setdefault(f"{s.uf}{s.municipio:05d}", []).append((s.zona, s.secao))
