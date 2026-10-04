"""Rotas públicas de leitura (resultados, mapas, locais, seções, busca, eventos)."""

import csv
import io
import mimetypes
from datetime import datetime
from pathlib import Path

import httpx
import orjson
from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import select

from app.api.deps import RecorteDep, SessaoDep, TempoDep, parse_t
from app.core.config import get_settings
from app.core.redis import get_redis
from app.models import Boletim, Candidato, Eleicao, LocalVotacao, Municipio, Secao
from app.services import demanda, resultados
from app.services.recortes import RecorteInvalido, parse
from app.tse.urls import MontadorUrls

router = APIRouter()


async def _pedir_secoes(turno: int, nivel: str, rid: str) -> None:
    """Abriu um local ou seção: avisa o coletor para baixar esses boletins (modo sob demanda)."""
    try:
        await demanda.registrar(get_redis(), turno, nivel, rid)
    except Exception:  # o pedido é só um sinal; nunca derruba a leitura
        pass


@router.get("/status")
async def status(session: SessaoDep) -> dict:
    s = get_settings()
    redis = get_redis()
    metricas = await redis.get("coletor:metricas")
    m = orjson.loads(metricas) if metricas else {}
    ultima_coleta = await redis.get("coletor:ultima_coleta")
    ult = await resultados.ultima_totalizacao(session)
    eleicoes = await resultados.listar_eleicoes(session)
    inicio = None
    if eleicoes:
        e = await session.get(Eleicao, eleicoes[0]["id"])
        if e and e.data:
            d, mth, a = e.data.split("/")
            inicio = f"{a}-{mth}-{d}T20:00:00+00:00"
    ao_vivo = bool(m) and not m.get("pausado")
    return {
        "ambiente": s.tse_ambiente, "ao_vivo": ao_vivo, "agora": datetime.now().astimezone().isoformat(),
        "ultima_totalizacao": resultados.iso(ult), "ultima_coleta": ultima_coleta.decode() if ultima_coleta else None,
        "inicio_divulgacao": inicio, "pct_secoes_br": await resultados.pct_br(session),
        "coletor": {"pausado": bool(m.get("pausado")), "req_por_seg": m.get("req_por_seg", 0.0)},
    }


@router.get("/eleicoes")
async def eleicoes(session: SessaoDep) -> list[dict]:
    return await resultados.listar_eleicoes(session)


@router.get("/resultados")
async def obter_resultados(session: SessaoDep, r: RecorteDep, t: TempoDep, cargo: int = 1, turno: int = 1) -> dict:
    await _pedir_secoes(turno, r.nivel, r.id)
    return await resultados.montar_resultado(session, turno, cargo, r, t)


@router.get("/resultados/serie")
async def serie(session: SessaoDep, r: RecorteDep, cargo: int = 1, turno: int = 1, de: str | None = None,
                ate: str | None = None, max_pontos: int = Query(300, ge=10, le=2000)) -> dict:
    return await resultados.serie(session, turno, cargo, r, parse_t(de), parse_t(ate), max_pontos)


@router.get("/recortes/filhos")
async def filhos(session: SessaoDep, r: RecorteDep, t: TempoDep, cargo: int = 1, turno: int = 1,
                 filhos: str | None = None, candidatos: str | None = None) -> dict:
    lista = [c for c in (candidatos or "").split(",") if c]
    if filhos and filhos not in ("uf", "municipio", "zona", "local", "secao"):
        raise HTTPException(422, "filhos inválido")
    await _pedir_secoes(turno, r.nivel, r.id)
    return await resultados.filhos(session, turno, cargo, r, t, filhos, lista or None)


@router.get("/progresso")
async def progresso(session: SessaoDep, t: TempoDep, turno: int = 1) -> dict:
    return await resultados.progresso(session, turno, t)


@router.get("/mapas/locais")
async def mapa_locais(session: SessaoDep, t: TempoDep, cargo: int = 1, turno: int = 1, uf: str | None = None,
                      municipio: str | None = None, bbox: str | None = None,
                      limite: int = Query(20000, ge=1, le=100000)) -> dict:
    caixa = None
    if bbox:
        try:
            a, b, c, d = (float(x) for x in bbox.split(","))
            caixa = (a, b, c, d)
        except ValueError as exc:
            raise HTTPException(422, "bbox inválido") from exc
    return await resultados.locais_mapa(session, turno, cargo, uf.lower() if uf else None, municipio, caixa, t, limite)


@router.get("/locais/{local_id}")
async def local(session: SessaoDep, local_id: str, turno: int = 1) -> dict:
    await _pedir_secoes(turno, "local", local_id.strip().lower())
    d = await resultados.detalhe_local(session, turno, local_id)
    if d is None:
        raise HTTPException(404, "local não encontrado")
    return d


@router.get("/secoes/{secao_id}")
async def secao(session: SessaoDep, secao_id: str, turno: int = 1) -> dict:
    await _pedir_secoes(turno, "secao", secao_id.strip().lower())
    try:
        d = await resultados.detalhe_secao(session, turno, secao_id)
    except RecorteInvalido as exc:
        raise HTTPException(422, "id de seção inválido") from exc
    if d is None:
        raise HTTPException(404, "seção não encontrada")
    return d


@router.get("/diagnostico/locais/{local_id}")
async def diagnostico_local(session: SessaoDep, local_id: str, turno: int = 1) -> dict:
    """Por que as seções de um local não aparecem: o que o coletor e o worker fizeram com cada uma.

    Só lê o que já está no banco e no Redis (não faz requisição ao TSE). Abra a página do local antes, para o
    coletor receber o pedido, e espere uns 30 s.
    """
    lid = local_id.strip().lower()
    redis = get_redis()
    local = await session.get(LocalVotacao, lid)
    secoes = (await session.execute(select(Secao).where(Secao.local_id == lid))).scalars().all()
    bols = set((await session.execute(select(Boletim.secao_id).where(
        Boletim.turno == turno, Boletim.local_id == lid))).scalars())
    pedidos = await demanda.pedidos(redis)
    met = await redis.get("coletor:metricas")
    m = orjson.loads(met) if met else {}

    async def _ler(chave: str) -> dict | None:
        v = await redis.get(chave)
        return orjson.loads(v) if v else None

    return {
        "local_id": lid,
        "local_no_banco": local is not None,
        "municipio_no_banco": bool(local and await session.get(Municipio, local.municipio_id)),
        "pedido_registrado": (turno, "local", lid) in pedidos,
        "coletor": {k: m.get(k) for k in ("modo_secoes", "fila_secoes", "secoes_coletadas", "atualizado_em", "pausado")},
        "secoes": [{
            "id": sec.id,
            "boletim_no_banco": sec.id in bols,
            "coletor": await _ler(f"diag:secao:{sec.id}"),
            "worker": await _ler(f"diag:secao:{sec.id}:worker"),
        } for sec in secoes],
    }


@router.get("/candidatos")
async def candidatos(session: SessaoDep, turno: int = 1, cargo: int | None = None, uf: str | None = None) -> list[dict]:
    return await resultados.listar_candidatos(session, turno, cargo, uf.lower() if uf else None)


@router.get("/candidatos/{sqcand}")
async def candidato(session: SessaoDep, sqcand: str, t: TempoDep, turno: int = 1) -> dict:
    d = await resultados.detalhe_candidato(session, sqcand, turno, t)
    if d is None:
        raise HTTPException(404, "candidato não encontrado")
    return d


@router.get("/fotos/{sqcand}")
async def foto(session: SessaoDep, sqcand: str) -> Response:
    s = get_settings()
    if not sqcand.isdigit():
        raise HTTPException(404)
    cache = Path(s.dir_cache_fotos) / sqcand
    if cache.exists():
        tipo = (cache.with_suffix(".tipo").read_text() if cache.with_suffix(".tipo").exists() else "image/jpeg")
        return Response(cache.read_bytes(), media_type=tipo, headers={"Cache-Control": "public, max-age=86400"})
    c = await session.get(Candidato, sqcand)
    if c is None:
        raise HTTPException(404)
    e = await session.get(Eleicao, c.eleicao_id)
    if e is None:
        raise HTTPException(404)
    url = MontadorUrls(s.tse_base_url, {}, e.ciclo, e.cd_pleito).foto(e.cd_eleicao, c.uf, sqcand)
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.get(url)
    except httpx.HTTPError as exc:
        raise HTTPException(404) from exc
    if r.status_code != 200:
        raise HTTPException(404)
    tipo = r.headers.get("content-type", mimetypes.guess_type(url)[0] or "image/jpeg")
    try:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(r.content)
        cache.with_suffix(".tipo").write_text(tipo)
    except OSError:
        pass
    return Response(r.content, media_type=tipo, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/busca")
async def busca(session: SessaoDep, q: str = Query("", max_length=80), limite: int = Query(20, ge=1, le=50)) -> dict:
    return await resultados.buscar(session, q, limite)


@router.get("/eventos")
async def eventos(session: SessaoDep, turno: int = 1, desde: str | None = None, ate: str | None = None,
                  limite: int = Query(100, ge=1, le=1000), tipos: str | None = None, cargo: int | None = None,
                  nivel: str | None = None, id: str | None = None) -> list[dict]:
    return await resultados.listar_eventos(session, turno, parse_t(desde), limite,
                                           [x for x in (tipos or "").split(",") if x] or None, cargo, nivel, id, parse_t(ate))


@router.get("/linha-do-tempo")
async def linha_do_tempo(session: SessaoDep, turno: int = 1) -> dict:
    return await resultados.linha_do_tempo(session, turno)


def _csv(linhas: list[dict], colunas: list[str]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=colunas, extrasaction="ignore", delimiter=";")
    w.writeheader()
    for ln in linhas:
        w.writerow(ln)
    return buf.getvalue()


@router.get("/export")
async def exportar(session: SessaoDep, t: TempoDep, recurso: str = "resultados", formato: str = "csv",
                   cargo: int = 1, turno: int = 1, nivel: str = "br", id: str = "br", filhos: str | None = None) -> Response:
    try:
        r = parse(id, nivel)
    except RecorteInvalido as exc:
        raise HTTPException(422, "recorte inválido") from exc
    if recurso == "resultados":
        dados = await resultados.montar_resultado(session, turno, cargo, r, t)
        linhas = [{**c, "recorte": r.id} for c in dados.get("candidatos", [])]
        colunas = ["recorte", "posicao", "numero", "nome_urna", "partido_sigla", "votos", "pct_validos", "situacao",
                   "situacao_geral"]
    elif recurso == "filhos":
        dados = await resultados.filhos(session, turno, cargo, r, t, filhos)
        linhas = [{**i, "lider_nome": (i.get("lider") or {}).get("nome_urna"), "lider_pct": (i.get("lider") or {}).get("pct")}
                  for i in dados["itens"]]
        colunas = ["nivel", "id", "nome", "uf", "status", "pct_secoes", "eleitorado", "comparecimento", "votos_validos",
                   "brancos", "nulos", "lider_nome", "lider_pct", "margem_pp"]
    else:
        raise HTTPException(422, "recurso inválido")
    nome = f"{recurso}-{cargo}-{r.id}"
    if formato == "json":
        return Response(orjson.dumps(dados), media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="{nome}.json"'})
    return Response(_csv(linhas, colunas).encode("utf-8-sig"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{nome}.csv"'})
