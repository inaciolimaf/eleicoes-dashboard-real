"""Processamento dos arquivos coletados: grava no banco, detecta eventos e publica em tempo real."""

from __future__ import annotations

import logging
import time
from datetime import datetime

import orjson
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Candidato, EleicaoCargo, Evento
from app.realtime import topicos
from app.services import alertas, eventos, ingestao, resultados
from app.services.recortes import parse
from app.tse import bu as bu_mod
from app.tse.parsers import parse_acompanhamento, parse_resultado

log = logging.getLogger(__name__)


def _dt(v: str | None) -> datetime | None:
    return datetime.fromisoformat(v) if v else None


class Processador:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], redis: Redis):
        self.sm = sessionmaker
        self.redis = redis
        self._cargos: dict[tuple[int, int], tuple[str, int | None]] = {}
        self._numeros: dict[tuple[int, str], tuple[float, dict]] = {}

    async def processar(self, tipo: str, corpo: bytes, ctx: dict) -> None:
        if tipo == "resultado":
            await self.resultado(corpo, ctx)
        elif tipo == "acompanhamento":
            await self.acompanhamento(corpo, ctx)
        elif tipo == "boletim":
            await self.boletim(corpo, ctx)
        else:
            log.warning("tipo de mensagem desconhecido: %s", tipo)

    async def _cargo(self, session: AsyncSession, eleicao_id: int, cd: int) -> tuple[str, int | None]:
        chave = (eleicao_id, cd)
        if chave not in self._cargos:
            c = await session.get(EleicaoCargo, {"eleicao_id": eleicao_id, "cd_cargo": cd})
            self._cargos[chave] = (c.sistema, c.vagas) if c else ("majoritario", 1)
        return self._cargos[chave]

    # ------------------------------------------------------------------ resultado (EA20)
    async def resultado(self, corpo: bytes, ctx: dict) -> None:
        dados = orjson.loads(corpo)
        c = ingestao.Contexto(
            turno=int(ctx["turno"]), eleicao_id=int(ctx["eleicao_id"]), cd_cargo=int(ctx["cd_cargo"]), nivel=ctx["nivel"],
            recorte_id=ctx["recorte_id"], pai_id=ctx["pai_id"], uf=ctx["uf"], arquivo=ctx.get("arquivo"),
            jws_verificado=bool(ctx.get("jws_ok")), capturado_em=_dt(ctx.get("capturado_em")),
        )
        res = parse_resultado(dados, c.cd_cargo)
        async with self.sm() as session:
            sistema, vagas = await self._cargo(session, c.eleicao_id, c.cd_cargo)
            sqs = [x.sqcand for x in res.candidatos]
            antes: dict[str, str] = {}
            if c.abrangencia_do_cargo:
                rows = await session.execute(select(Candidato.sqcand, Candidato.situacao_geral).where(Candidato.sqcand.in_(sqs)))
                antes = dict(rows.all())
            out = await ingestao.ingerir_resultado(session, c, res, sistema, vagas)
            if out is None:
                return
            anterior, novo = out
            evs: list[dict] = []
            if c.nivel in ("br", "uf"):
                rows = await session.execute(select(Candidato.sqcand, Candidato.nome_urna, Candidato.situacao_geral)
                                             .where(Candidato.sqcand.in_(sqs)))
                info = rows.all()
                nomes = {sq: n for sq, n, _ in info}
                depois = {sq: st for sq, _, st in info} if c.abrangencia_do_cargo else None
                nome_recorte = await resultados.nome_recorte(session, parse(c.recorte_id))
                evs = eventos.detectar(anterior, novo, nomes, nome_recorte, sistema, antes, depois)
                for ev in evs:
                    obj = (await session.execute(insert(Evento).values(**ev).returning(Evento))).scalar_one()
                    ev["json"] = resultados.evento_json(obj)
                await session.commit()
                for ev in evs:
                    await topicos.publicar(self.redis, topicos.eventos(c.turno), "evento", ev["json"])
            await self._publicar_resultado(session, c, novo)
            await self._alertas_resultado(session, novo, evs)

    async def _publicar_resultado(self, session: AsyncSession, c: ingestao.Contexto, linha: dict) -> None:
        r = parse(c.recorte_id)
        t_res = topicos.res(c.turno, c.cd_cargo, c.nivel, c.recorte_id)
        if await topicos.esta_ativo(self.redis, t_res):
            payload = await resultados.montar_resultado(session, c.turno, c.cd_cargo, r)
            await topicos.publicar(self.redis, t_res, "res", payload)
        pais = []
        pai = r.pai
        if pai is not None:
            pais.append(topicos.filhos(c.turno, c.cd_cargo, pai.nivel, pai.id))
        if c.nivel == "municipio":
            pais.append(topicos.filhos(c.turno, c.cd_cargo, "br", "br", "municipio"))
        ativos = [t for t in pais if await topicos.esta_ativo(self.redis, t)]
        if ativos:
            item = await resultados.item_filho(session, c.turno, c.cd_cargo, linha)
            for t in ativos:
                await topicos.publicar(self.redis, t, "filho", item)

    async def _alertas_resultado(self, session: AsyncSession, linha: dict, evs: list[dict]) -> None:
        for a in await alertas.ativos(session):
            r = alertas.avaliar_resultado(a, linha, evs)
            if r:
                await alertas.marcar_disparado(session, a)
                await topicos.publicar(self.redis, topicos.usuario(str(a.usuario_id)), "alerta",
                                       {"titulo": r[0], "descricao": r[1], "alerta_id": str(a.id)})

    # ------------------------------------------------------------------ acompanhamento (EA14/EA15)
    async def acompanhamento(self, corpo: bytes, ctx: dict) -> None:
        acomp = parse_acompanhamento(orjson.loads(corpo))
        turno = int(ctx["turno"])
        async with self.sm() as session:
            mudou = await ingestao.ingerir_progresso(session, turno, acomp, ctx["uf"], _dt(ctx.get("capturado_em")))
            if any(m["nivel"] in ("br", "uf") for m in mudou):
                payload = await resultados.progresso(session, turno, None)
                await topicos.publicar(self.redis, topicos.progresso(turno), "progresso", payload)

    # ------------------------------------------------------------------ boletim de urna
    async def _mapa_numeros(self, session: AsyncSession, turno: int, uf: str) -> dict:
        chave = (turno, uf)
        hit = self._numeros.get(chave)
        if hit is None or time.monotonic() - hit[0] > 60 or not hit[1]:
            self._numeros[chave] = (time.monotonic(), await ingestao.mapa_numeros(session, turno, uf))
        return self._numeros[chave][1]

    async def boletim(self, corpo: bytes, ctx: dict) -> None:
        sid_pedido = ctx.get("secao_id")
        try:
            await self._boletim(corpo, ctx)
        except Exception as exc:
            if sid_pedido:
                await self._diag_worker(sid_pedido, {"erro": f"{type(exc).__name__}: {exc}"})
            raise

    async def _diag_worker(self, sid: str, dados: dict) -> None:
        try:
            await self.redis.set(f"diag:secao:{sid}:worker", orjson.dumps({"quando": datetime.now().isoformat(), **dados}),
                                 ex=3600)
        except Exception:
            pass

    async def _boletim(self, corpo: bytes, ctx: dict) -> None:
        turno = int(ctx["turno"])
        uf = ctx["uf"]
        bu = bu_mod.decodificar(corpo)
        async with self.sm() as session:
            numeros = await self._mapa_numeros(session, turno, uf)
            alterados = await ingestao.ingerir_boletim(session, turno, uf, bu, ctx["hash"], ctx.get("status", "Totalizado"),
                                                       _dt(ctx.get("totalizado_em")), ctx.get("url"), numeros)
            mid = f"{uf}{bu.municipio:05d}"
            sid = f"{mid}-z{bu.zona:04d}-s{bu.secao:04d}"
            if ctx.get("secao_id"):
                await self._diag_worker(ctx["secao_id"], {
                    "ok": True, "bu": {"municipio": bu.municipio, "zona": bu.zona, "local": bu.local, "secao": bu.secao},
                    "secao_gravada": sid, "locais_recalculados": alterados,
                    "aviso": None if alterados else "município do BU não está no banco ou o local não foi recalculado"})
            zid = f"{mid}-z{bu.zona:04d}"
            for cd, lid in alterados:
                t_loc = topicos.locais(turno, cd, mid)
                if await topicos.esta_ativo(self.redis, t_loc):
                    item = await resultados.item_local(session, turno, cd, lid)
                    if item:
                        await topicos.publicar(self.redis, t_loc, "local", item)
                for nivel, rid in (("local", lid), ("secao", sid), ("zona", zid)):
                    t_res = topicos.res(turno, cd, nivel, rid)
                    if await topicos.esta_ativo(self.redis, t_res):
                        payload = await resultados.montar_resultado(session, turno, cd, parse(rid))
                        await topicos.publicar(self.redis, t_res, "res", payload)
                t_fil = topicos.filhos(turno, cd, "zona", zid)
                if await topicos.esta_ativo(self.redis, t_fil):
                    dados = await resultados.filhos(session, turno, cd, parse(zid), None)
                    for it in dados["itens"]:
                        if it["id"] == lid:
                            await topicos.publicar(self.redis, t_fil, "filho", it)
            if alterados:
                item = await resultados.item_local(session, turno, alterados[0][0], alterados[0][1])
                for a in await alertas.ativos(session):
                    r = alertas.avaliar_local(a, alterados[0][1], item["status"] if item else "")
                    if r:
                        await alertas.marcar_disparado(session, a)
                        await topicos.publicar(self.redis, topicos.usuario(str(a.usuario_id)), "alerta",
                                               {"titulo": r[0], "descricao": r[1], "alerta_id": str(a.id)})
