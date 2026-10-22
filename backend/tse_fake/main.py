"""Mock of the TSE: serves the dissemination files with the same URL structure, on a simulated clock.

Environment variables:
  FAKE_SEMENTE (2026)  FAKE_ESCALA (1.0)  FAKE_VELOCIDADE (10)
  FAKE_INICIO_MIN (-2: starts 2 minutes before 17h)
"""

from __future__ import annotations

import os
import re
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any

import orjson
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.infra.tse.jws import sign
from tse_fake.key import private_key_fake
from tse_fake.publication import START, Publication, round_of
from tse_fake.scenario import CYCLE, ELECTION_EVENT_CODE, Scenario

MAX_CACHE_ENTRIES = 60000


class Clock:
    """Simulated clock: `agora` gives the seconds since 17h; `ajustar` sets speed, pause and position."""

    def __init__(self, speed: float, start_seconds: float) -> None:
        self.speed = speed
        self.paused = False
        self._ref_real = time.monotonic()
        self._ref_sim = start_seconds

    def now(self) -> float:
        if self.paused:
            return self._ref_sim
        return self._ref_sim + (time.monotonic() - self._ref_real) * self.speed

    def adjust(
        self, speed: float | None = None, paused: bool | None = None, go_to: float | None = None
    ) -> None:
        current = self.now()
        self._ref_sim = current if go_to is None else go_to
        self._ref_real = time.monotonic()
        if speed is not None:
            self.speed = max(0.1, speed)
        if paused is not None:
            self.paused = paused


class FakeState:
    scenario: Scenario
    publication: Publication
    clock: Clock
    cache: OrderedDict[str, tuple[str, bytes]]


state = FakeState()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    seed = int(os.getenv("FAKE_SEMENTE", "2026"))
    scale = float(os.getenv("FAKE_ESCALA", "1.0"))
    state.scenario = Scenario(seed=seed, scale=scale)
    state.publication = Publication(state.scenario)
    state.clock = Clock(
        float(os.getenv("FAKE_VELOCIDADE", "10")), float(os.getenv("FAKE_INICIO_MIN", "-2")) * 60
    )
    state.cache = OrderedDict()
    yield


app = FastAPI(title="TSE fake (mock da divulgação de resultados)", lifespan=lifespan)


def current_round() -> float:
    """Files reflect the last tally round (the TSE rewrites them in batches)."""
    return round_of(state.clock.now())


RE_RESULT = re.compile(
    r"^(?P<uf>[a-z]{2})(?P<mun>\d{5})?(?:-z(?P<zona>\d{4}))?-c(?P<cargo>\d{4})-e(?P<ele>\d{6})-(?P<tp>[ue])\.(?P<ext>json|jws)$"
)
RE_TRACKING = re.compile(r"^(?P<uf>[a-z]{2})-e(?P<ele>\d{6})-ab\.(?P<ext>json|jws)$")
RE_MUNICIPALITIES = re.compile(r"^mun-e(?P<ele>\d{6})-cm\.(?P<ext>json|jws)$")


def _response(
    request: Request,
    key: str,
    generation_id: str,
    doc: dict[str, Any] | None,
    ext: str,
    generate: Callable[[], dict[str, Any]] | None = None,
) -> Response:
    etag = f'"{generation_id}"'
    if request.headers.get("if-none-match") in (etag, generation_id):
        return Response(status_code=304, headers={"ETag": etag})
    cache_key = f"{key}|{ext}"
    hit = state.cache.get(cache_key)
    if hit and hit[0] == generation_id:
        body = hit[1]
    else:
        if doc is None and generate is not None:
            doc = generate()
        payload = orjson.dumps(doc)
        body = (
            sign(payload, private_key_fake(), get_settings().tse_fake_kid).encode()
            if ext == "jws"
            else payload
        )
        state.cache[cache_key] = (generation_id, body)
        if len(state.cache) > MAX_CACHE_ENTRIES:
            state.cache.popitem(last=False)
    return Response(
        content=body, media_type="application/json", headers={"ETag": etag, "Cache-Control": "no-cache"}
    )


@app.get("/oficial/comum/config/ele-c.{ext}")
async def catalog(ext: str, request: Request) -> Response:
    if ext not in ("json", "jws"):
        raise HTTPException(404)
    doc = state.publication.catalog()
    return _response(request, "catalogo", doc["idg"], doc, ext)


@app.get("/oficial/" + CYCLE + "/{election}/config/{file_name}")
async def config_municipalities(election: int, file_name: str, request: Request) -> Response:
    m = RE_MUNICIPALITIES.match(file_name)
    if not m or int(m["ele"]) != election:
        raise HTTPException(404)
    doc = state.publication.municipalities(election)
    return _response(request, f"cm{election}", doc["idg"], doc, m["ext"])


@app.get("/oficial/" + CYCLE + "/{election}/dados/{state_code}/{file_name}")
async def data_file(election: int, state_code: str, file_name: str, request: Request) -> Response:
    t = current_round()
    m = RE_TRACKING.match(file_name)
    if m:
        if (
            m["uf"] != state_code
            or int(m["ele"]) != election
            or (state_code != "br" and state_code not in state.scenario.state_ranges)
        ):
            raise HTTPException(404)
        generation_id, doc = state.publication.tracking(election, state_code, t)
        return _response(request, f"ab{election}{state_code}", generation_id, doc, m["ext"])
    m = RE_RESULT.match(file_name)
    if not m or m["uf"] != state_code or int(m["ele"]) != election:
        raise HTTPException(404)
    municipality = int(m["mun"]) if m["mun"] else None
    zone = int(m["zona"]) if m["zona"] else None
    try:
        r = state.publication.result(
            election, int(m["cargo"]), state_code, municipality, zone, t, only_elected=m["tp"] == "e"
        )
    except KeyError:
        r = None
    if r is None:
        raise HTTPException(404)
    generation_id, doc = r
    return _response(request, file_name.rsplit(".", 1)[0], generation_id, doc, m["ext"])


@app.get("/oficial/" + CYCLE + "/{election}/fotos/{state_code}/{file_name}")
async def photo(election: int, state_code: str, file_name: str) -> Response:
    sq = file_name.split(".")[0]
    svg = state.publication.photo_svg(sq)
    if svg is None:
        raise HTTPException(404)
    return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "max-age=86400"})


@app.get("/oficial/" + CYCLE + "/arquivo-urna/{election_event}/config/{state_code}/{file_name}")
async def config_sections(election_event: int, state_code: str, file_name: str, request: Request) -> Response:
    expected = f"{state_code}-p{ELECTION_EVENT_CODE:06d}-cs.json"
    if (
        election_event != ELECTION_EVENT_CODE
        or file_name != expected
        or state_code not in state.scenario.state_ranges
    ):
        raise HTTPException(404)
    return _response(
        request,
        f"cs{state_code}",
        "100000003",
        None,
        "json",
        generate=lambda: state.publication.uf_sections(state_code),
    )


@app.get(
    "/oficial/"
    + CYCLE
    + "/arquivo-urna/{election_event}/dados/{state_code}/{municipality}/{zone}/{section}/{file_name}"
)
async def auxiliary(
    election_event: int,
    state_code: str,
    municipality: int,
    zone: int,
    section: int,
    file_name: str,
    request: Request,
) -> Response:
    i = state.publication.section_index(state_code, municipality, zone, section)
    expected = (
        f"p{ELECTION_EVENT_CODE:06d}-{state_code}-m{municipality:05d}-z{zone:04d}-s{section:04d}-aux.json"
    )
    if election_event != ELECTION_EVENT_CODE or i is None or file_name != expected:
        raise HTTPException(404)
    generation_id, doc = state.publication.auxiliary(i, current_round())
    return _response(request, f"aux{i}", generation_id, doc, "json")


@app.get(
    "/oficial/"
    + CYCLE
    + "/arquivo-urna/{election_event}/dados/{state_code}/{municipality}/{zone}/{section}/{hash_}/{file_name}"
)
async def ballot_file(
    election_event: int,
    state_code: str,
    municipality: int,
    zone: int,
    section: int,
    hash_: str,
    file_name: str,
) -> Response:
    i = state.publication.section_index(state_code, municipality, zone, section)
    if (
        i is None
        or hash_ != state.publication.section_hash(i)
        or float(state.scenario.section_time[i]) > current_round()
    ):
        raise HTTPException(404)
    name = state.publication.bu_name(i)
    if file_name == f"{name}.bu":
        return Response(content=state.publication.ballot_box(i), media_type="application/octet-stream")
    if file_name.startswith(name):
        return Response(content=b"MOCK", media_type="application/octet-stream")
    raise HTTPException(404)


@app.get("/dadosabertos/eleitorado_local_votacao_2026.csv")
async def places_csv() -> Response:
    return Response(content=state.publication.places_csv(), media_type="text/csv; charset=latin-1")


class Control(BaseModel):
    """Body of `POST /_fake/controle`; the JSON keys are the ones the Makefile and the admin send."""

    speed: float | None = Field(None, alias="velocidade")
    paused: bool | None = Field(None, alias="pausado")
    restart: bool = Field(False, alias="reiniciar")
    #: "HH:MM" (Brasilia time) or minutes after 17h.
    go_to: str | None = Field(None, alias="ir_para")


def _state_json() -> dict[str, Any]:
    clock = state.clock
    now = clock.now()
    scenario = state.scenario
    pct = float((scenario.section_time <= now).mean() * 100)
    return {
        "agora": (START + timedelta(seconds=now)).isoformat(),
        "minutos_apos_17h": round(now / 60, 2),
        "velocidade": clock.speed,
        "pausado": clock.paused,
        "pct_secoes": round(pct, 3),
        "fim_previsto": (START + timedelta(seconds=float(scenario.section_time.max()))).isoformat(),
        "secoes": int(scenario.section_count),
        "municipios": len(scenario.municipalities),
        "locais": len(scenario.polling_places),
    }


@app.get("/_fake/estado")
async def read_state() -> dict[str, Any]:
    return _state_json()


@app.post("/_fake/controle")
async def control(ctrl: Control) -> dict[str, Any]:
    go_to: float | None = None
    if ctrl.restart:
        go_to = float(os.getenv("FAKE_INICIO_MIN", "-2")) * 60
    elif ctrl.go_to:
        if ":" in ctrl.go_to:
            hours, minutes = ctrl.go_to.split(":")[:2]
            go_to = (int(hours) - 17) * 3600 + int(minutes) * 60
        else:
            go_to = float(ctrl.go_to) * 60
    state.clock.adjust(speed=ctrl.speed, paused=ctrl.paused, go_to=go_to)
    return _state_json()


@app.get("/saude")
async def health() -> dict[str, bool]:
    return {"ok": True}
