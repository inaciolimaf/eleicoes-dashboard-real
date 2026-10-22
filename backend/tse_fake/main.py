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
from pydantic import BaseModel

from app.core.config import get_settings
from app.infra.tse.jws import sign
from tse_fake.key import private_key_fake
from tse_fake.publication import START, Publication, round_of
from tse_fake.scenario import CYCLE, ELECTION_EVENT_CODE, Scenario

MAX_CACHE_ENTRIES = 60000


class Relogio:
    """Simulated clock: `agora` gives the seconds since 17h; `ajustar` sets speed, pause and position."""

    def __init__(self, velocidade: float, inicio_seg: float) -> None:
        self.velocidade = velocidade
        self.pausado = False
        self._ref_real = time.monotonic()
        self._ref_sim = inicio_seg

    def agora(self) -> float:
        if self.pausado:
            return self._ref_sim
        return self._ref_sim + (time.monotonic() - self._ref_real) * self.velocidade

    def ajustar(
        self, velocidade: float | None = None, pausado: bool | None = None, ir_para: float | None = None
    ) -> None:
        current = self.agora()
        self._ref_sim = current if ir_para is None else ir_para
        self._ref_real = time.monotonic()
        if velocidade is not None:
            self.velocidade = max(0.1, velocidade)
        if pausado is not None:
            self.pausado = pausado


class Estado:
    cenario: Scenario
    div: Publication
    relogio: Relogio
    cache: OrderedDict[str, tuple[str, bytes]]


estado = Estado()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    seed = int(os.getenv("FAKE_SEMENTE", "2026"))
    scale = float(os.getenv("FAKE_ESCALA", "1.0"))
    estado.cenario = Scenario(semente=seed, escala=scale)
    estado.div = Publication(estado.cenario)
    estado.relogio = Relogio(
        float(os.getenv("FAKE_VELOCIDADE", "10")), float(os.getenv("FAKE_INICIO_MIN", "-2")) * 60
    )
    estado.cache = OrderedDict()
    yield


app = FastAPI(title="TSE fake (mock da divulgação de resultados)", lifespan=lifespan)


def current_round() -> float:
    """Files reflect the last tally round (the TSE rewrites them in batches)."""
    return round_of(estado.relogio.agora())


RE_RESULT = re.compile(
    r"^(?P<uf>[a-z]{2})(?P<mun>\d{5})?(?:-z(?P<zona>\d{4}))?-c(?P<cargo>\d{4})-e(?P<ele>\d{6})-(?P<tp>[ue])\.(?P<ext>json|jws)$"
)
RE_TRACKING = re.compile(r"^(?P<uf>[a-z]{2})-e(?P<ele>\d{6})-ab\.(?P<ext>json|jws)$")
RE_MUNICIPALITIES = re.compile(r"^mun-e(?P<ele>\d{6})-cm\.(?P<ext>json|jws)$")


def _response(
    request: Request,
    key: str,
    idg: str,
    doc: dict[str, Any] | None,
    ext: str,
    generate: Callable[[], dict[str, Any]] | None = None,
) -> Response:
    etag = f'"{idg}"'
    if request.headers.get("if-none-match") in (etag, idg):
        return Response(status_code=304, headers={"ETag": etag})
    cache_key = f"{key}|{ext}"
    hit = estado.cache.get(cache_key)
    if hit and hit[0] == idg:
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
        estado.cache[cache_key] = (idg, body)
        if len(estado.cache) > MAX_CACHE_ENTRIES:
            estado.cache.popitem(last=False)
    return Response(
        content=body, media_type="application/json", headers={"ETag": etag, "Cache-Control": "no-cache"}
    )


@app.get("/oficial/comum/config/ele-c.{ext}")
async def catalog(ext: str, request: Request) -> Response:
    if ext not in ("json", "jws"):
        raise HTTPException(404)
    doc = estado.div.catalog()
    return _response(request, "catalogo", doc["idg"], doc, ext)


@app.get("/oficial/" + CYCLE + "/{ele}/config/{arquivo}")
async def config_municipalities(ele: int, arquivo: str, request: Request) -> Response:
    m = RE_MUNICIPALITIES.match(arquivo)
    if not m or int(m["ele"]) != ele:
        raise HTTPException(404)
    doc = estado.div.municipalities(ele)
    return _response(request, f"cm{ele}", doc["idg"], doc, m["ext"])


@app.get("/oficial/" + CYCLE + "/{ele}/dados/{uf}/{arquivo}")
async def data_file(ele: int, uf: str, arquivo: str, request: Request) -> Response:
    t = current_round()
    m = RE_TRACKING.match(arquivo)
    if m:
        if m["uf"] != uf or int(m["ele"]) != ele or (uf != "br" and uf not in estado.cenario.state_ranges):
            raise HTTPException(404)
        idg, doc = estado.div.tracking(ele, uf, t)
        return _response(request, f"ab{ele}{uf}", idg, doc, m["ext"])
    m = RE_RESULT.match(arquivo)
    if not m or m["uf"] != uf or int(m["ele"]) != ele:
        raise HTTPException(404)
    municipality = int(m["mun"]) if m["mun"] else None
    zone = int(m["zona"]) if m["zona"] else None
    try:
        r = estado.div.result(ele, int(m["cargo"]), uf, municipality, zone, t, only_elected=m["tp"] == "e")
    except KeyError:
        r = None
    if r is None:
        raise HTTPException(404)
    idg, doc = r
    return _response(request, arquivo.rsplit(".", 1)[0], idg, doc, m["ext"])


@app.get("/oficial/" + CYCLE + "/{ele}/fotos/{uf}/{arquivo}")
async def photo(ele: int, uf: str, arquivo: str) -> Response:
    sq = arquivo.split(".")[0]
    svg = estado.div.photo_svg(sq)
    if svg is None:
        raise HTTPException(404)
    return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "max-age=86400"})


@app.get("/oficial/" + CYCLE + "/arquivo-urna/{pleito}/config/{uf}/{arquivo}")
async def config_sections(pleito: int, uf: str, arquivo: str, request: Request) -> Response:
    expected = f"{uf}-p{ELECTION_EVENT_CODE:06d}-cs.json"
    if pleito != ELECTION_EVENT_CODE or arquivo != expected or uf not in estado.cenario.state_ranges:
        raise HTTPException(404)
    return _response(
        request, f"cs{uf}", "100000003", None, "json", generate=lambda: estado.div.uf_sections(uf)
    )


@app.get("/oficial/" + CYCLE + "/arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/{arquivo}")
async def auxiliary(
    pleito: int, uf: str, mun: int, zona: int, secao: int, arquivo: str, request: Request
) -> Response:
    i = estado.div.section_index(uf, mun, zona, secao)
    expected = f"p{ELECTION_EVENT_CODE:06d}-{uf}-m{mun:05d}-z{zona:04d}-s{secao:04d}-aux.json"
    if pleito != ELECTION_EVENT_CODE or i is None or arquivo != expected:
        raise HTTPException(404)
    idg, doc = estado.div.auxiliary(i, current_round())
    return _response(request, f"aux{i}", idg, doc, "json")


@app.get("/oficial/" + CYCLE + "/arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/{hash_}/{arquivo}")
async def ballot_file(
    pleito: int, uf: str, mun: int, zona: int, secao: int, hash_: str, arquivo: str
) -> Response:
    i = estado.div.section_index(uf, mun, zona, secao)
    if (
        i is None
        or hash_ != estado.div.section_hash(i)
        or float(estado.cenario.section_time[i]) > current_round()
    ):
        raise HTTPException(404)
    name = estado.div.bu_name(i)
    if arquivo == f"{name}.bu":
        return Response(content=estado.div.ballot_box(i), media_type="application/octet-stream")
    if arquivo.startswith(name):
        return Response(content=b"MOCK", media_type="application/octet-stream")
    raise HTTPException(404)


@app.get("/dadosabertos/eleitorado_local_votacao_2026.csv")
async def places_csv() -> Response:
    return Response(content=estado.div.places_csv(), media_type="text/csv; charset=latin-1")


class Control(BaseModel):
    velocidade: float | None = None
    pausado: bool | None = None
    reiniciar: bool = False
    ir_para: str | None = None  # "HH:MM" (Brasilia time) or minutes after 17h


def _state_json() -> dict[str, Any]:
    clock = estado.relogio
    now = clock.agora()
    scenario = estado.cenario
    pct = float((scenario.section_time <= now).mean() * 100)
    return {
        "agora": (START + timedelta(seconds=now)).isoformat(),
        "minutos_apos_17h": round(now / 60, 2),
        "velocidade": clock.velocidade,
        "pausado": clock.pausado,
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
    ir_para: float | None = None
    if ctrl.reiniciar:
        ir_para = float(os.getenv("FAKE_INICIO_MIN", "-2")) * 60
    elif ctrl.ir_para:
        if ":" in ctrl.ir_para:
            hours, minutes = ctrl.ir_para.split(":")[:2]
            ir_para = (int(hours) - 17) * 3600 + int(minutes) * 60
        else:
            ir_para = float(ctrl.ir_para) * 60
    estado.relogio.ajustar(velocidade=ctrl.velocidade, pausado=ctrl.pausado, ir_para=ir_para)
    return _state_json()


@app.get("/saude")
async def health() -> dict[str, bool]:
    return {"ok": True}
