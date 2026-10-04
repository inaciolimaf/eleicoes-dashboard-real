"""Gravação dos arquivos do TSE já normalizados no banco."""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Boletim,
    Candidato,
    Eleicao,
    EleicaoCargo,
    LocalVotacao,
    Municipio,
    ProgressoAtual,
    ProgressoSnapshot,
    ResultadoAtual,
    ResultadoLocal,
    Secao,
    Snapshot,
    Zona,
)
from app.services import cores, situacao
from app.services.recortes import local_id, municipio_id, secao_id, zona_id
from app.tse.bu import BoletimUrna
from app.tse.catalogo import Catalogo
from app.tse.parsers import AcompanhamentoTSE, MunicipioTSE, ResultadoTSE, SecaoTSE

VAGAS_MAJORITARIO = {1: 1, 3: 1, 5: 2, 11: 1}


def agora() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------- catálogo


async def ingerir_catalogo(session: AsyncSession, catalogo: Catalogo, ambiente: str) -> list[Eleicao]:
    pleito = catalogo.pleito_atual()
    if pleito is None:
        return []
    registros = []
    for e in pleito.eleicoes:
        registros.append((e.cd, e.turno, e.tipo, e.nome, e.cargos))
        if e.cd_t2 and e.turno == 1:
            # eleição de 2º turno: só cargos majoritários de turno duplo
            cargos_t2 = [c for c in e.cargos if c.cd in (1, 3, 11)]
            if cargos_t2:
                registros.append((e.cd_t2, 2, e.tipo, e.nome.replace("1º Turno", "2º Turno"), cargos_t2))
    vistos: dict[int, Eleicao] = {}
    for cd, turno, tipo, nome, cargos in registros:
        if cd in vistos:
            continue
        stmt = (
            insert(Eleicao)
            .values(ambiente=ambiente, ciclo=pleito.ciclo, cd_pleito=pleito.cd, cd_eleicao=cd, turno=turno, tipo=tipo,
                    nome=nome, data=pleito.data, cd_eleicao_t2=None)
            .on_conflict_do_update(index_elements=["ambiente", "cd_eleicao"],
                                   set_={"ciclo": pleito.ciclo, "cd_pleito": pleito.cd, "turno": turno, "tipo": tipo,
                                         "nome": nome, "data": pleito.data})
            .returning(Eleicao.id)
        )
        eleicao_id = (await session.execute(stmt)).scalar_one()
        for c in cargos:
            vagas = VAGAS_MAJORITARIO.get(c.cd) if c.sistema == "majoritario" else None
            await session.execute(
                insert(EleicaoCargo)
                .values(eleicao_id=eleicao_id, cd_cargo=c.cd, nome=c.nome, sistema=c.sistema, abrangencia=c.abrangencia,
                        vagas=vagas)
                .on_conflict_do_update(index_elements=["eleicao_id", "cd_cargo"],
                                       set_={"nome": c.nome, "sistema": c.sistema, "vagas": vagas})
            )
        vistos[cd] = eleicao_id  # type: ignore[assignment]
    await session.commit()
    res = await session.execute(select(Eleicao).where(Eleicao.ambiente == ambiente))
    return list(res.scalars())


# ---------------------------------------------------------------- dimensões geográficas


_MINUSCULAS = {"de", "da", "do", "das", "dos", "e", "d'"}


def nome_proprio(nome: str) -> str:
    partes = nome.lower().split()
    return " ".join(p if i and p in _MINUSCULAS else p[:1].upper() + p[1:] for i, p in enumerate(partes))


async def ingerir_municipios(session: AsyncSession, lista: list[MunicipioTSE], geo: dict[int, tuple]) -> int:
    """`geo`: código IBGE -> (lat, lon[, nome com grafia correta])."""
    linhas = []
    zonas = []
    for m in lista:
        g = geo.get(m.cd_ibge or -1, ())
        lat, lon = (g[0], g[1]) if len(g) >= 2 else (None, None)
        nome = g[2] if len(g) >= 3 else nome_proprio(m.nome)
        mid = municipio_id(m.uf, m.cd)
        linhas.append({"id": mid, "uf": m.uf, "cd_tse": m.cd, "cd_ibge": m.cd_ibge, "nome": nome,
                       "capital": m.capital, "lat": lat, "lon": lon})
        for z in m.zonas:
            zonas.append({"id": zona_id(m.uf, m.cd, z), "municipio_id": mid, "uf": m.uf, "numero": z})
    for i in range(0, len(linhas), 1000):
        stmt = insert(Municipio).values(linhas[i:i + 1000])
        await session.execute(stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={"nome": stmt.excluded.nome, "cd_ibge": stmt.excluded.cd_ibge, "capital": stmt.excluded.capital,
                  "lat": func.coalesce(stmt.excluded.lat, Municipio.lat), "lon": func.coalesce(stmt.excluded.lon, Municipio.lon)},
        ))
    for i in range(0, len(zonas), 2000):
        await session.execute(insert(Zona).values(zonas[i:i + 2000]).on_conflict_do_nothing())
    await session.commit()
    return len(linhas)


async def ingerir_secoes(session: AsyncSession, lista: list[SecaoTSE]) -> int:
    zonas: dict[str, dict] = {}
    linhas = []
    for s in lista:
        mid = municipio_id(s.uf, s.municipio)
        zid = zona_id(s.uf, s.municipio, s.zona)
        zonas[zid] = {"id": zid, "municipio_id": mid, "uf": s.uf, "numero": s.zona}
        linhas.append({"id": secao_id(s.uf, s.municipio, s.zona, s.secao), "municipio_id": mid, "zona_id": zid,
                       "uf": s.uf, "numero": s.secao, "agregadora": s.agregadora})
    z = list(zonas.values())
    for i in range(0, len(z), 2000):
        await session.execute(insert(Zona).values(z[i:i + 2000]).on_conflict_do_nothing())
    for i in range(0, len(linhas), 3000):
        await session.execute(insert(Secao).values(linhas[i:i + 3000]).on_conflict_do_nothing())
    await session.commit()
    return len(linhas)


def ler_csv_locais(conteudo: bytes) -> Iterable[dict]:
    """CSV do Portal de Dados Abertos (separador ';', latin-1). Aceita também um .zip com o CSV dentro.

    O zip oficial traz um CSV por UF e um "_BRASIL" com todas: usa o do Brasil (ou, sem ele, todos os CSVs).
    """
    if conteudo[:2] != b"PK":
        yield from csv.DictReader(io.StringIO(conteudo.decode("latin-1")), delimiter=";")
        return
    import zipfile

    with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
        nomes = [n for n in z.namelist() if n.lower().endswith(".csv")]
        brasil = [n for n in nomes if "brasil" in n.lower()]
        for nome in brasil or nomes:
            with z.open(nome) as f:
                yield from csv.DictReader(io.TextIOWrapper(f, encoding="latin-1", newline=""), delimiter=";")


def _coord(valor: str | None) -> float | None:
    try:
        v = float(str(valor).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return None if v in (-1.0, 0.0) else v


async def _gravar_secoes(session: AsyncSession, secoes: list[dict]) -> None:
    stmt = insert(Secao).values(secoes)
    await session.execute(stmt.on_conflict_do_update(index_elements=["id"], set_={
        "local_id": stmt.excluded.local_id, "eleitores_aptos": stmt.excluded.eleitores_aptos}))


async def importar_locais(session: AsyncSession, linhas: Iterable[dict]) -> int:
    municipios = {
        m.id: m for m in (await session.execute(select(Municipio))).scalars()
    }
    locais: dict[str, dict] = {}
    secoes: list[dict] = []
    zonas: dict[str, dict] = {}
    for ln in linhas:
        uf = str(ln.get("SG_UF", "")).lower()
        try:
            cd_mun = int(ln["CD_MUNICIPIO"])
            zona = int(ln["NR_ZONA"])
            secao = int(ln["NR_SECAO"])
            nr_local = int(ln["NR_LOCAL_VOTACAO"])
        except (KeyError, ValueError, TypeError):
            continue
        mid = municipio_id(uf, cd_mun)
        if mid not in municipios:
            continue
        lid = local_id(uf, cd_mun, zona, nr_local)
        zid = zona_id(uf, cd_mun, zona)
        zonas[zid] = {"id": zid, "municipio_id": mid, "uf": uf, "numero": zona}
        aptos = int(ln.get("QT_ELEITOR_SECAO") or ln.get("QT_ELEITOR") or 0)
        lat, lon = _coord(ln.get("NR_LATITUDE")), _coord(ln.get("NR_LONGITUDE"))
        loc = locais.get(lid)
        if loc is None:
            mun = municipios[mid]
            aprox = lat is None or lon is None
            loc = locais[lid] = {
                "id": lid, "municipio_id": mid, "zona_id": zid, "uf": uf, "numero": nr_local,
                "nome": str(ln.get("NM_LOCAL_VOTACAO") or f"LOCAL {nr_local}").strip(),
                "endereco": (ln.get("DS_ENDERECO") or "").strip() or None,
                "bairro": (ln.get("NM_BAIRRO") or "").strip() or None,
                "cep": (ln.get("NR_CEP") or "").strip() or None,
                "lat": lat if not aprox else mun.lat, "lon": lon if not aprox else mun.lon, "aproximado": aprox,
                "eleitores_aptos": 0, "qtd_secoes": 0,
            }
        loc["eleitores_aptos"] += aptos
        loc["qtd_secoes"] += 1
        secoes.append({"id": secao_id(uf, cd_mun, zona, secao), "municipio_id": mid, "zona_id": zid, "local_id": lid,
                       "uf": uf, "numero": secao, "eleitores_aptos": aptos})
        if len(secoes) >= 3000:  # o arquivo do Brasil tem ~500 mil seções: grava em blocos
            await _gravar_secoes(session, secoes)
            secoes = []
    if secoes:
        await _gravar_secoes(session, secoes)
    zl = list(zonas.values())
    for i in range(0, len(zl), 2000):
        await session.execute(insert(Zona).values(zl[i:i + 2000]).on_conflict_do_nothing())
    lista = list(locais.values())
    for i in range(0, len(lista), 1000):
        stmt = insert(LocalVotacao).values(lista[i:i + 1000])
        await session.execute(stmt.on_conflict_do_update(index_elements=["id"], set_={
            c: getattr(stmt.excluded, c) for c in ("nome", "endereco", "bairro", "cep", "lat", "lon", "aproximado",
                                                   "eleitores_aptos", "qtd_secoes")}))
    await session.commit()
    return len(lista)


# ---------------------------------------------------------------- resultados (EA20)


@dataclass
class Contexto:
    turno: int
    eleicao_id: int
    cd_cargo: int
    nivel: str
    recorte_id: str
    pai_id: str
    uf: str
    arquivo: str | None = None
    jws_verificado: bool = False
    capturado_em: datetime | None = None

    @property
    def abrangencia_do_cargo(self) -> bool:
        return (self.cd_cargo == 1 and self.nivel == "br") or (self.cd_cargo != 1 and self.nivel == "uf")


def _linha_resultado(ctx: Contexto, res: ResultadoTSE, sistema: str) -> dict:
    t = res.totais
    cands = [{"sq": c.sqcand, "v": c.votos, "p": round(c.pct_validos, 4), "e": c.eleito, "st": c.situacao_tse,
              "d": c.destinacao} for c in res.candidatos]
    validos_ordem = sorted((c for c in res.candidatos if c.destinacao.startswith("V")), key=lambda c: -c.votos)
    lider = validos_ordem[0] if validos_ordem and validos_ordem[0].votos > 0 else None
    segundo = validos_ordem[1] if len(validos_ordem) > 1 and validos_ordem[1].votos > 0 else None
    agrs = [{"nome": a.nome, "partidos": a.partidos, "v": a.votos, "vag": a.vagas, "n": a.numero} for a in res.agremiacoes]
    partido_lider = max(res.agremiacoes, key=lambda a: a.votos).nome if res.agremiacoes and sistema == "proporcional" else None
    return {
        "eleicao_id": ctx.eleicao_id, "turno": ctx.turno, "cd_cargo": ctx.cd_cargo, "nivel": ctx.nivel,
        "recorte_id": ctx.recorte_id, "pai_id": ctx.pai_id, "uf": ctx.uf, "idg": int(res.idg or 0),
        "totalizado_em": res.totalizado_em or ctx.capturado_em or agora(), "capturado_em": ctx.capturado_em or agora(),
        "jws_verificado": ctx.jws_verificado, "fonte": "tse", "arquivo": ctx.arquivo,
        "eleitorado": t.eleitorado, "eleitorado_apurado": t.eleitorado_apurado, "secoes_total": t.secoes_total,
        "secoes_totalizadas": t.secoes_totalizadas, "pct_secoes": t.pct_secoes, "comparecimento": t.comparecimento,
        "pct_comparecimento": t.pct_comparecimento, "abstencao": t.abstencao, "pct_abstencao": t.pct_abstencao,
        "votos_total": t.votos_total, "votos_validos": t.votos_validos, "pct_validos": t.pct_validos,
        "brancos": t.brancos, "pct_brancos": t.pct_brancos, "nulos": t.nulos, "pct_nulos": t.pct_nulos,
        "matematicamente_definido": res.matematicamente_definido, "totalizacao_final": res.final,
        "lider_sqcand": lider.sqcand if lider else None, "lider_votos": lider.votos if lider else 0,
        "lider_pct": lider.pct_validos if lider else 0.0,
        "segundo_sqcand": segundo.sqcand if segundo else None, "segundo_votos": segundo.votos if segundo else 0,
        "segundo_pct": segundo.pct_validos if segundo else 0.0,
        "margem_pp": round((lider.pct_validos if lider else 0) - (segundo.pct_validos if segundo else 0), 4),
        "partido_lider": partido_lider, "candidatos": cands, "agremiacoes": agrs,
    }


async def _upsert_candidatos(session: AsyncSession, ctx: Contexto, res: ResultadoTSE, vagas: int) -> None:
    sit = situacao.calcular(
        [{"sq": c.sqcand, "v": c.votos, "e": c.eleito, "st": c.situacao_tse, "d": c.destinacao} for c in res.candidatos],
        vagas, res.final, res.matematicamente_definido, ctx.abrangencia_do_cargo,
    )
    linhas = []
    for c in res.candidatos:
        linhas.append({
            "sqcand": c.sqcand, "eleicao_id": ctx.eleicao_id, "turno": ctx.turno, "cd_cargo": ctx.cd_cargo,
            "uf": "br" if ctx.cd_cargo == 1 else ctx.uf,
            "numero": c.numero, "nome": c.nome, "nome_urna": c.nome_urna, "partido_sigla": c.partido_sigla,
            "partido_numero": c.partido_numero, "agremiacao": c.agremiacao, "cor": cores.cor_candidato(c.numero, c.partido_numero, c.partido_sigla),
            "vices": [{"nome": v.nome, "tipo": "vice" if v.tipo == "v" else "suplente"} for v in c.vices],
            "situacao_geral": sit.get(c.sqcand, situacao.EM_APURACAO),
            "eleito": sit.get(c.sqcand) in (situacao.ELEITO, situacao.MATEMATICAMENTE_ELEITO),
        })
    for i in range(0, len(linhas), 500):
        stmt = insert(Candidato).values(linhas[i:i + 500])
        if ctx.abrangencia_do_cargo:
            stmt = stmt.on_conflict_do_update(index_elements=["sqcand"], set_={
                c: getattr(stmt.excluded, c) for c in ("nome", "nome_urna", "partido_sigla", "partido_numero",
                                                       "agremiacao", "cor", "vices", "situacao_geral", "eleito", "numero")})
        else:
            stmt = stmt.on_conflict_do_nothing()
        await session.execute(stmt)


_candidatos_conhecidos: set[str] = set()


async def ingerir_resultado(
    session: AsyncSession, ctx: Contexto, res: ResultadoTSE, sistema: str, vagas: int | None
) -> tuple[dict | None, dict] | None:
    """Grava snapshot + estado atual. Devolve (estado_anterior, novo) ou None se o snapshot já existia.

    O estado anterior só é lido nos níveis BR/UF (detecção de eventos); nos demais o upsert é condicional.
    """
    linha = _linha_resultado(ctx, res, sistema)
    snap = await session.execute(
        insert(Snapshot).values(**linha).on_conflict_do_nothing(
            index_elements=["turno", "cd_cargo", "nivel", "recorte_id", "idg"]).returning(Snapshot.id)
    )
    if snap.scalar_one_or_none() is None:
        await session.rollback()
        return None
    vagas_eff = vagas if sistema == "majoritario" else 0
    if ctx.abrangencia_do_cargo or any(c.sqcand not in _candidatos_conhecidos for c in res.candidatos):
        await _upsert_candidatos(session, ctx, res, vagas_eff or 0)
        _candidatos_conhecidos.update(c.sqcand for c in res.candidatos)
    anterior_dict = None
    if ctx.nivel in ("br", "uf"):
        anterior = (await session.execute(
            select(ResultadoAtual).where(ResultadoAtual.turno == ctx.turno, ResultadoAtual.cd_cargo == ctx.cd_cargo,
                                         ResultadoAtual.nivel == ctx.nivel, ResultadoAtual.recorte_id == ctx.recorte_id)
        )).scalar_one_or_none()
        anterior_dict = _como_dict(anterior) if anterior else None
    stmt = insert(ResultadoAtual).values(**linha)
    await session.execute(stmt.on_conflict_do_update(
        index_elements=["turno", "cd_cargo", "nivel", "recorte_id"],
        set_={k: getattr(stmt.excluded, k) for k in linha if k not in ("turno", "cd_cargo", "nivel", "recorte_id")},
        where=(ResultadoAtual.totalizado_em < stmt.excluded.totalizado_em)
        | ((ResultadoAtual.totalizado_em == stmt.excluded.totalizado_em) & (ResultadoAtual.idg <= stmt.excluded.idg)),
    ))
    if ctx.nivel == "municipio" and ctx.cd_cargo == 1:
        await session.execute(update(Municipio).where(Municipio.id == ctx.recorte_id)
                              .values(eleitorado=linha["eleitorado"]))
    await session.commit()
    return anterior_dict, linha


def _como_dict(obj: object) -> dict:
    return {c.key: getattr(obj, c.key) for c in obj.__table__.columns}  # type: ignore[attr-defined]


# ---------------------------------------------------------------- acompanhamento (EA14/EA15)


async def ingerir_progresso(session: AsyncSession, turno: int, acomp: AcompanhamentoTSE, uf_arquivo: str,
                            capturado_em: datetime | None = None) -> list[dict]:
    mudou: list[dict] = []
    for item in acomp.itens:
        if item.tipo == "br":
            nivel, rid, uf = "br", "br", "br"
        elif item.tipo == "uf":
            nivel, rid, uf = "uf", item.codigo, item.codigo
        else:
            nivel = "municipio"
            uf = uf_arquivo
            rid = item.codigo if item.codigo[:2].isalpha() else municipio_id(uf_arquivo, int(item.codigo))
        linha = {
            "turno": turno, "nivel": nivel, "recorte_id": rid, "uf": uf, "idg": int(acomp.idg or 0),
            "totalizado_em": item.totalizado_em, "capturado_em": capturado_em or agora(), "andamento": item.andamento,
            "secoes_total": item.secoes_total, "secoes_totalizadas": item.secoes_totalizadas,
            "pct_secoes": item.pct_secoes, "eleitorado": item.eleitorado, "comparecimento": item.comparecimento,
            "pct_comparecimento": item.pct_comparecimento, "municipios_finalizados": item.municipios_finalizados,
            "municipios_parciais": item.municipios_parciais, "municipios_nao_recebidos": item.municipios_nao_recebidos,
        }
        atual = (await session.execute(select(ProgressoAtual).where(
            ProgressoAtual.turno == turno, ProgressoAtual.nivel == nivel, ProgressoAtual.recorte_id == rid))).scalar_one_or_none()
        if atual is not None and atual.secoes_totalizadas == item.secoes_totalizadas and atual.totalizado_em == item.totalizado_em:
            continue
        if nivel != "municipio":
            await session.execute(insert(ProgressoSnapshot).values(**linha).on_conflict_do_nothing())
        stmt = insert(ProgressoAtual).values(**linha)
        await session.execute(stmt.on_conflict_do_update(
            index_elements=["turno", "nivel", "recorte_id"],
            set_={k: getattr(stmt.excluded, k) for k in linha if k not in ("turno", "nivel", "recorte_id")}))
        linha["anterior_secoes"] = atual.secoes_totalizadas if atual else 0
        mudou.append(linha)
    await session.commit()
    return mudou


# ---------------------------------------------------------------- boletins de urna


async def mapa_numeros(session: AsyncSession, turno: int, uf: str) -> dict[tuple[int, int], str]:
    """(cd_cargo, numero) -> sqcand, para Presidente (uf=br) e cargos estaduais da UF."""
    res = await session.execute(select(Candidato.cd_cargo, Candidato.numero, Candidato.sqcand).where(
        Candidato.turno == turno, Candidato.uf.in_(["br", uf])))
    return {(int(c), int(n)): sq for c, n, sq in res.all()}


async def ingerir_boletim(
    session: AsyncSession, turno: int, uf: str, bu: BoletimUrna, hash_: str, status: str,
    totalizado_em: datetime | None, url: str | None, numeros: dict[tuple[int, int], str],
) -> list[tuple[int, str]]:
    """Grava o BU e recalcula o resultado do local. Devolve [(cd_cargo, local_id)] alterados."""
    mid = municipio_id(uf, bu.municipio)
    zid = zona_id(uf, bu.municipio, bu.zona)
    lid = local_id(uf, bu.municipio, bu.zona, bu.local)
    sid = secao_id(uf, bu.municipio, bu.zona, bu.secao)
    votos: dict[str, dict] = {}
    for cargo in bu.cargos:
        nom: dict[str, int] = {}
        leg: dict[str, int] = {}
        for v in cargo.votos:
            if v.tipo == "nominal" and v.numero is not None:
                nom[str(v.numero)] = nom.get(str(v.numero), 0) + v.votos
            elif v.tipo == "legenda" and v.numero is not None:
                leg[str(v.numero)] = leg.get(str(v.numero), 0) + v.votos
        votos[str(cargo.cd_cargo)] = {"comp": cargo.comparecimento, "b": cargo.brancos, "n": cargo.nulos,
                                      "nom": nom, "leg": leg}
    mun = await session.get(Municipio, mid)
    if mun is None:
        return []
    if await session.get(LocalVotacao, lid) is None:
        await session.execute(insert(LocalVotacao).values(
            id=lid, municipio_id=mid, zona_id=zid, uf=uf, numero=bu.local, nome=f"LOCAL DE VOTAÇÃO {bu.local}",
            lat=mun.lat, lon=mun.lon, aproximado=True, eleitores_aptos=0, qtd_secoes=0).on_conflict_do_nothing())
        await session.execute(insert(Zona).values(id=zid, municipio_id=mid, uf=uf, numero=bu.zona).on_conflict_do_nothing())
    await session.execute(insert(Secao).values(
        id=sid, municipio_id=mid, zona_id=zid, local_id=lid, uf=uf, numero=bu.secao, eleitores_aptos=bu.eleitores_aptos,
    ).on_conflict_do_update(index_elements=["id"], set_={"local_id": lid}))
    linha = {"turno": turno, "secao_id": sid, "local_id": lid, "zona_id": zid, "municipio_id": mid, "uf": uf,
             "hash": hash_, "status": status, "totalizado_em": totalizado_em, "emitido_em": bu.emitido_em,
             "capturado_em": agora(), "eleitores_aptos": bu.eleitores_aptos, "comparecimento": bu.comparecimento,
             "assinatura_ok": None, "url": url, "votos": votos}
    stmt = insert(Boletim).values(**linha)
    await session.execute(stmt.on_conflict_do_update(index_elements=["turno", "secao_id"], set_={
        k: getattr(stmt.excluded, k) for k in linha if k not in ("turno", "secao_id")}))
    alterados = await recalcular_local(session, turno, lid, numeros)
    await session.commit()
    return alterados


async def recalcular_local(session: AsyncSession, turno: int, lid: str, numeros: dict[tuple[int, int], str]) -> list[tuple[int, str]]:
    local = await session.get(LocalVotacao, lid)
    if local is None:
        return []
    bols = (await session.execute(select(Boletim).where(Boletim.turno == turno, Boletim.local_id == lid))).scalars().all()
    total_secoes = local.qtd_secoes or (await session.execute(
        select(func.count()).select_from(Secao).where(Secao.local_id == lid))).scalar_one()
    soma: dict[str, dict] = {}
    for b in bols:
        for cd, v in (b.votos or {}).items():
            s = soma.setdefault(cd, {"comp": 0, "b": 0, "n": 0, "nom": {}, "leg": {}, "secoes": 0})
            s["comp"] += v.get("comp", 0)
            s["b"] += v.get("b", 0)
            s["n"] += v.get("n", 0)
            s["secoes"] += 1
            for k in ("nom", "leg"):
                for num, q in (v.get(k) or {}).items():
                    s[k][num] = s[k].get(num, 0) + q
    alterados = []
    ultimo = max((b.totalizado_em for b in bols if b.totalizado_em), default=None)
    for cd, s in soma.items():
        cd_cargo = int(cd)
        validos = sum(s["nom"].values()) + sum(s["leg"].values())
        ordem = sorted(s["nom"].items(), key=lambda kv: -kv[1])
        lider = ordem[0] if ordem and ordem[0][1] > 0 else None
        segundo = ordem[1] if len(ordem) > 1 else None
        lider_pct = lider[1] * 100.0 / validos if lider and validos else 0.0
        seg_pct = segundo[1] * 100.0 / validos if segundo and validos else 0.0
        apuradas = s["secoes"]
        status = "apurado" if total_secoes and apuradas >= total_secoes else ("parcial" if apuradas else "nao_recebido")
        linha = {
            "turno": turno, "cd_cargo": cd_cargo, "local_id": lid, "municipio_id": local.municipio_id, "uf": local.uf,
            "secoes_total": max(total_secoes, apuradas), "secoes_apuradas": apuradas, "status": status,
            "comparecimento": s["comp"], "votos_validos": validos, "brancos": s["b"], "nulos": s["n"],
            "lider_sqcand": numeros.get((cd_cargo, int(lider[0]))) if lider else None,
            "lider_pct": round(lider_pct, 4), "margem_pp": round(lider_pct - seg_pct, 4),
            "votos": {"nom": s["nom"], "leg": s["leg"]}, "atualizado_em": ultimo,
        }
        stmt = insert(ResultadoLocal).values(**linha)
        await session.execute(stmt.on_conflict_do_update(
            index_elements=["turno", "cd_cargo", "local_id"],
            set_={k: getattr(stmt.excluded, k) for k in linha if k not in ("turno", "cd_cargo", "local_id")}))
        alterados.append((cd_cargo, lid))
    return alterados
