"""Mock do TSE: serve os arquivos de divulgação com a mesma estrutura de URLs, com relógio simulado.

Variáveis de ambiente:
  FAKE_SEMENTE (2026)  FAKE_ESCALA (1.0)  FAKE_VELOCIDADE (10)  FAKE_INICIO_MIN (-2: começa 2 min antes das 17h)
"""

from __future__ import annotations

import os
import re
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import timedelta

import orjson
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel

from app.core.config import get_settings
from app.tse.jws import assinar
from tse_fake.cenario import CICLO, PLEITO, Cenario
from tse_fake.chave import chave_privada_fake
from tse_fake.divulgacao import INICIO, Divulgacao


class Relogio:
    def __init__(self, velocidade: float, inicio_seg: float):
        self.velocidade = velocidade
        self.pausado = False
        self._ref_real = time.monotonic()
        self._ref_sim = inicio_seg

    def agora(self) -> float:
        if self.pausado:
            return self._ref_sim
        return self._ref_sim + (time.monotonic() - self._ref_real) * self.velocidade

    def ajustar(self, velocidade: float | None = None, pausado: bool | None = None, ir_para: float | None = None) -> None:
        atual = self.agora()
        self._ref_sim = atual if ir_para is None else ir_para
        self._ref_real = time.monotonic()
        if velocidade is not None:
            self.velocidade = max(0.1, velocidade)
        if pausado is not None:
            self.pausado = pausado


class Estado:
    cenario: Cenario
    div: Divulgacao
    relogio: Relogio
    cache: OrderedDict[str, tuple[str, bytes]]


estado = Estado()


@asynccontextmanager
async def lifespan(app: FastAPI):
    semente = int(os.getenv("FAKE_SEMENTE", "2026"))
    escala = float(os.getenv("FAKE_ESCALA", "1.0"))
    estado.cenario = Cenario(semente=semente, escala=escala)
    estado.div = Divulgacao(estado.cenario)
    estado.relogio = Relogio(float(os.getenv("FAKE_VELOCIDADE", "10")), float(os.getenv("FAKE_INICIO_MIN", "-2")) * 60)
    estado.cache = OrderedDict()
    yield


app = FastAPI(title="TSE fake (mock da divulgação de resultados)", lifespan=lifespan)

def agora_rodada() -> float:
    """Arquivos refletem a última rodada de totalização (o TSE regrava em lotes)."""
    return Divulgacao.rodada(estado.relogio.agora())


RE_RESULTADO = re.compile(r"^(?P<uf>[a-z]{2})(?P<mun>\d{5})?(?:-z(?P<zona>\d{4}))?-c(?P<cargo>\d{4})-e(?P<ele>\d{6})-(?P<tp>[ue])\.(?P<ext>json|jws)$")
RE_AB = re.compile(r"^(?P<uf>[a-z]{2})-e(?P<ele>\d{6})-ab\.(?P<ext>json|jws)$")
RE_CM = re.compile(r"^mun-e(?P<ele>\d{6})-cm\.(?P<ext>json|jws)$")


def _resposta(request: Request, chave: str, idg: str, doc: dict | None, ext: str, gerar=None) -> Response:
    etag = f'"{idg}"'
    if request.headers.get("if-none-match") in (etag, idg):
        return Response(status_code=304, headers={"ETag": etag})
    cache_key = f"{chave}|{ext}"
    hit = estado.cache.get(cache_key)
    if hit and hit[0] == idg:
        corpo = hit[1]
    else:
        if doc is None and gerar is not None:
            doc = gerar()
        payload = orjson.dumps(doc)
        corpo = assinar(payload, chave_privada_fake(), get_settings().tse_fake_kid).encode() if ext == "jws" else payload
        estado.cache[cache_key] = (idg, corpo)
        if len(estado.cache) > 60000:
            estado.cache.popitem(last=False)
    return Response(content=corpo, media_type="application/json", headers={"ETag": etag, "Cache-Control": "no-cache"})


@app.get("/oficial/comum/config/ele-c.{ext}")
async def catalogo(ext: str, request: Request) -> Response:
    if ext not in ("json", "jws"):
        raise HTTPException(404)
    doc = estado.div.catalogo()
    return _resposta(request, "catalogo", doc["idg"], doc, ext)


@app.get("/oficial/" + CICLO + "/{ele}/config/{arquivo}")
async def config_municipios(ele: int, arquivo: str, request: Request) -> Response:
    m = RE_CM.match(arquivo)
    if not m or int(m["ele"]) != ele:
        raise HTTPException(404)
    doc = estado.div.municipios(ele)
    return _resposta(request, f"cm{ele}", doc["idg"], doc, m["ext"])


@app.get("/oficial/" + CICLO + "/{ele}/dados/{uf}/{arquivo}")
async def dados(ele: int, uf: str, arquivo: str, request: Request) -> Response:
    t = agora_rodada()
    m = RE_AB.match(arquivo)
    if m:
        if m["uf"] != uf or int(m["ele"]) != ele or (uf != "br" and uf not in estado.cenario.faixa_uf):
            raise HTTPException(404)
        idg, doc = estado.div.acompanhamento(ele, uf, t)
        return _resposta(request, f"ab{ele}{uf}", idg, doc, m["ext"])
    m = RE_RESULTADO.match(arquivo)
    if not m or m["uf"] != uf or int(m["ele"]) != ele:
        raise HTTPException(404)
    mun = int(m["mun"]) if m["mun"] else None
    zona = int(m["zona"]) if m["zona"] else None
    try:
        r = estado.div.resultado(ele, int(m["cargo"]), uf, mun, zona, t, so_eleitos=m["tp"] == "e")
    except KeyError:
        r = None
    if r is None:
        raise HTTPException(404)
    idg, doc = r
    return _resposta(request, arquivo.rsplit(".", 1)[0], idg, doc, m["ext"])


@app.get("/oficial/" + CICLO + "/{ele}/fotos/{uf}/{arquivo}")
async def foto(ele: int, uf: str, arquivo: str) -> Response:
    sq = arquivo.split(".")[0]
    svg = estado.div.foto_svg(sq)
    if svg is None:
        raise HTTPException(404)
    return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "max-age=86400"})


@app.get("/oficial/" + CICLO + "/arquivo-urna/{pleito}/config/{uf}/{arquivo}")
async def config_secoes(pleito: int, uf: str, arquivo: str, request: Request) -> Response:
    if pleito != PLEITO or arquivo != f"{uf}-p{PLEITO:06d}-cs.json" or uf not in estado.cenario.faixa_uf:
        raise HTTPException(404)
    return _resposta(request, f"cs{uf}", "100000003", None, "json", gerar=lambda: estado.div.secoes(uf))


@app.get("/oficial/" + CICLO + "/arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/{arquivo}")
async def auxiliar(pleito: int, uf: str, mun: int, zona: int, secao: int, arquivo: str, request: Request) -> Response:
    i = estado.div.indice_secao(uf, mun, zona, secao)
    esperado = f"p{PLEITO:06d}-{uf}-m{mun:05d}-z{zona:04d}-s{secao:04d}-aux.json"
    if pleito != PLEITO or i is None or arquivo != esperado:
        raise HTTPException(404)
    idg, doc = estado.div.auxiliar(i, agora_rodada())
    return _resposta(request, f"aux{i}", idg, doc, "json")


@app.get("/oficial/" + CICLO + "/arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/{hash_}/{arquivo}")
async def arquivo_urna(pleito: int, uf: str, mun: int, zona: int, secao: int, hash_: str, arquivo: str) -> Response:
    i = estado.div.indice_secao(uf, mun, zona, secao)
    if i is None or hash_ != estado.div.hash_secao(i) or float(estado.cenario.sec_t[i]) > agora_rodada():
        raise HTTPException(404)
    nome = estado.div.nome_bu(i)
    if arquivo == f"{nome}.bu":
        return Response(content=estado.div.boletim(i), media_type="application/octet-stream")
    if arquivo.startswith(nome):
        return Response(content=b"MOCK", media_type="application/octet-stream")
    raise HTTPException(404)


@app.get("/dadosabertos/eleitorado_local_votacao_2026.csv")
async def locais_csv() -> Response:
    return Response(content=estado.div.csv_locais(), media_type="text/csv; charset=latin-1")


class Controle(BaseModel):
    velocidade: float | None = None
    pausado: bool | None = None
    reiniciar: bool = False
    ir_para: str | None = None  # "HH:MM" (horário de Brasília) ou minutos após as 17h


def _estado_json() -> dict:
    r = estado.relogio
    agora = r.agora()
    c = estado.cenario
    pct = float((c.sec_t <= agora).mean() * 100)
    return {
        "agora": (INICIO + timedelta(seconds=agora)).isoformat(),
        "minutos_apos_17h": round(agora / 60, 2),
        "velocidade": r.velocidade,
        "pausado": r.pausado,
        "pct_secoes": round(pct, 3),
        "fim_previsto": (INICIO + timedelta(seconds=float(c.sec_t.max()))).isoformat(),
        "secoes": int(c.n), "municipios": len(c.municipios), "locais": len(c.locais),
    }


@app.get("/_fake/estado")
async def ver_estado() -> dict:
    return _estado_json()


@app.post("/_fake/controle")
async def controlar(ctrl: Controle) -> dict:
    ir_para: float | None = None
    if ctrl.reiniciar:
        ir_para = float(os.getenv("FAKE_INICIO_MIN", "-2")) * 60
    elif ctrl.ir_para:
        if ":" in ctrl.ir_para:
            h, m = ctrl.ir_para.split(":")[:2]
            ir_para = (int(h) - 17) * 3600 + int(m) * 60
        else:
            ir_para = float(ctrl.ir_para) * 60
    estado.relogio.ajustar(velocidade=ctrl.velocidade, pausado=ctrl.pausado, ir_para=ir_para)
    return _estado_json()


@app.get("/saude")
async def saude() -> dict:
    return {"ok": True}
