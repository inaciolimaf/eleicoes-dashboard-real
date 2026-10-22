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

from app.infra.tse.bu import BoletimUrna
from app.infra.tse.catalog import Catalogo
from app.infra.tse.parsers import AcompanhamentoTSE, MunicipioTSE, ResultadoTSE, SecaoTSE
from app.modules.ballot_reports import BallotBoxReport, PollingPlaceResult
from app.modules.elections import Candidate, Election, ElectionOffice
from app.modules.elections import colors as cores
from app.modules.elections import status as situacao
from app.modules.geography import (
    ElectoralZone,
    Municipality,
    PollingPlace,
    PollingSection,
    local_id,
    municipio_id,
    secao_id,
    zona_id,
)
from app.modules.results.models import CurrentProgress, CurrentResult, ProgressSnapshot, ResultSnapshot

VAGAS_MAJORITARIO = {1: 1, 3: 1, 5: 2, 11: 1}


def agora() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------- catálogo


async def ingerir_catalogo(session: AsyncSession, catalogo: Catalogo, ambiente: str) -> list[Election]:
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
    vistos: dict[int, Election] = {}
    for cd, turno, tipo, nome, cargos in registros:
        if cd in vistos:
            continue
        stmt = (
            insert(Election)
            .values(
                tse_environment=ambiente,
                cycle=pleito.ciclo,
                election_event_code=pleito.cd,
                election_code=cd,
                round=turno,
                jurisdiction=tipo,
                name=nome,
                date=pleito.data,
                runoff_election_code=None,
            )
            .on_conflict_do_update(
                index_elements=["tse_environment", "election_code"],
                set_={
                    "cycle": pleito.ciclo,
                    "election_event_code": pleito.cd,
                    "round": turno,
                    "jurisdiction": tipo,
                    "name": nome,
                    "date": pleito.data,
                },
            )
            .returning(Election.id)
        )
        eleicao_id = (await session.execute(stmt)).scalar_one()
        for c in cargos:
            vagas = VAGAS_MAJORITARIO.get(c.cd) if c.sistema == "majoritario" else None
            await session.execute(
                insert(ElectionOffice)
                .values(
                    election_id=eleicao_id,
                    office_code=c.cd,
                    name=c.nome,
                    voting_system=c.sistema,
                    coverage=c.abrangencia,
                    seats=vagas,
                )
                .on_conflict_do_update(
                    index_elements=["election_id", "office_code"],
                    set_={"name": c.nome, "voting_system": c.sistema, "seats": vagas},
                )
            )
        vistos[cd] = eleicao_id  # type: ignore[assignment]
    await session.flush()
    res = await session.execute(select(Election).where(Election.tse_environment == ambiente))
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
        linhas.append(
            {
                "id": mid,
                "state_code": m.uf,
                "tse_code": m.cd,
                "ibge_code": m.cd_ibge,
                "name": nome,
                "is_capital": m.capital,
                "lat": lat,
                "lon": lon,
            }
        )
        for z in m.zonas:
            zonas.append(
                {"id": zona_id(m.uf, m.cd, z), "municipality_id": mid, "state_code": m.uf, "number": z}
            )
    for i in range(0, len(linhas), 1000):
        stmt = insert(Municipality).values(linhas[i : i + 1000])
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "name": stmt.excluded.name,
                    "ibge_code": stmt.excluded.ibge_code,
                    "is_capital": stmt.excluded.is_capital,
                    "lat": func.coalesce(stmt.excluded.lat, Municipality.lat),
                    "lon": func.coalesce(stmt.excluded.lon, Municipality.lon),
                },
            )
        )
    for i in range(0, len(zonas), 2000):
        await session.execute(insert(ElectoralZone).values(zonas[i : i + 2000]).on_conflict_do_nothing())
    await session.flush()
    return len(linhas)


async def ingerir_secoes(session: AsyncSession, lista: list[SecaoTSE]) -> int:
    zonas: dict[str, dict] = {}
    linhas = []
    for s in lista:
        mid = municipio_id(s.uf, s.municipio)
        zid = zona_id(s.uf, s.municipio, s.zona)
        zonas[zid] = {"id": zid, "municipality_id": mid, "state_code": s.uf, "number": s.zona}
        linhas.append(
            {
                "id": secao_id(s.uf, s.municipio, s.zona, s.secao),
                "municipality_id": mid,
                "electoral_zone_id": zid,
                "state_code": s.uf,
                "number": s.secao,
                "aggregator_section": s.agregadora,
            }
        )
    z = list(zonas.values())
    for i in range(0, len(z), 2000):
        await session.execute(insert(ElectoralZone).values(z[i : i + 2000]).on_conflict_do_nothing())
    for i in range(0, len(linhas), 3000):
        await session.execute(insert(PollingSection).values(linhas[i : i + 3000]).on_conflict_do_nothing())
    await session.flush()
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
    stmt = insert(PollingSection).values(secoes)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "polling_place_id": stmt.excluded.polling_place_id,
                "eligible_voters": stmt.excluded.eligible_voters,
            },
        )
    )


async def importar_locais(session: AsyncSession, linhas: Iterable[dict]) -> int:
    municipios = {m.id: m for m in (await session.execute(select(Municipality))).scalars()}
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
        zonas[zid] = {"id": zid, "municipality_id": mid, "state_code": uf, "number": zona}
        aptos = int(ln.get("QT_ELEITOR_SECAO") or ln.get("QT_ELEITOR") or 0)
        lat, lon = _coord(ln.get("NR_LATITUDE")), _coord(ln.get("NR_LONGITUDE"))
        loc = locais.get(lid)
        if loc is None:
            mun = municipios[mid]
            aprox = lat is None or lon is None
            loc = locais[lid] = {
                "id": lid,
                "municipality_id": mid,
                "electoral_zone_id": zid,
                "state_code": uf,
                "number": nr_local,
                "name": str(ln.get("NM_LOCAL_VOTACAO") or f"LOCAL {nr_local}").strip(),
                "address": (ln.get("DS_ENDERECO") or "").strip() or None,
                "neighborhood": (ln.get("NM_BAIRRO") or "").strip() or None,
                "zip_code": (ln.get("NR_CEP") or "").strip() or None,
                "lat": lat if not aprox else mun.lat,
                "lon": lon if not aprox else mun.lon,
                "is_approximate": aprox,
                "eligible_voters": 0,
                "section_count": 0,
            }
        loc["eligible_voters"] += aptos
        loc["section_count"] += 1
        secoes.append(
            {
                "id": secao_id(uf, cd_mun, zona, secao),
                "municipality_id": mid,
                "electoral_zone_id": zid,
                "polling_place_id": lid,
                "state_code": uf,
                "number": secao,
                "eligible_voters": aptos,
            }
        )
        if len(secoes) >= 3000:  # o arquivo do Brasil tem ~500 mil seções: grava em blocos
            await _gravar_secoes(session, secoes)
            secoes = []
    if secoes:
        await _gravar_secoes(session, secoes)
    zl = list(zonas.values())
    for i in range(0, len(zl), 2000):
        await session.execute(insert(ElectoralZone).values(zl[i : i + 2000]).on_conflict_do_nothing())
    lista = list(locais.values())
    for i in range(0, len(lista), 1000):
        stmt = insert(PollingPlace).values(lista[i : i + 1000])
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    c: getattr(stmt.excluded, c)
                    for c in (
                        "name",
                        "address",
                        "neighborhood",
                        "zip_code",
                        "lat",
                        "lon",
                        "is_approximate",
                        "eligible_voters",
                        "section_count",
                    )
                },
            )
        )
    await session.flush()
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
        return (self.cd_cargo == 1 and self.nivel == "country") or (
            self.cd_cargo != 1 and self.nivel == "state"
        )


def _linha_resultado(ctx: Contexto, res: ResultadoTSE, sistema: str) -> dict:
    t = res.totais
    cands = [
        {
            "sq": c.sqcand,
            "v": c.votos,
            "p": round(c.pct_validos, 4),
            "e": c.eleito,
            "st": c.situacao_tse,
            "d": c.destinacao,
        }
        for c in res.candidatos
    ]
    validos_ordem = sorted(
        (c for c in res.candidatos if c.destinacao.startswith("V")), key=lambda c: -c.votos
    )
    lider = validos_ordem[0] if validos_ordem and validos_ordem[0].votos > 0 else None
    segundo = validos_ordem[1] if len(validos_ordem) > 1 and validos_ordem[1].votos > 0 else None
    agrs = [
        {"nome": a.nome, "partidos": a.partidos, "v": a.votos, "vag": a.vagas, "n": a.numero}
        for a in res.agremiacoes
    ]
    partido_lider = (
        max(res.agremiacoes, key=lambda a: a.votos).nome
        if res.agremiacoes and sistema == "proporcional"
        else None
    )
    return {
        "election_id": ctx.eleicao_id,
        "round": ctx.turno,
        "office_code": ctx.cd_cargo,
        "level": ctx.nivel,
        "geo_area_id": ctx.recorte_id,
        "parent_id": ctx.pai_id,
        "state_code": ctx.uf,
        "generation_id": int(res.idg or 0),
        "tallied_at": res.totalizado_em or ctx.capturado_em or agora(),
        "captured_at": ctx.capturado_em or agora(),
        "jws_verified": ctx.jws_verificado,
        "source": "tse",
        "source_file": ctx.arquivo,
        "electorate": t.eleitorado,
        "tallied_electorate": t.eleitorado_apurado,
        "sections_total": t.secoes_total,
        "sections_tallied": t.secoes_totalizadas,
        "pct_sections": t.pct_secoes,
        "turnout": t.comparecimento,
        "pct_turnout": t.pct_comparecimento,
        "abstention": t.abstencao,
        "pct_abstention": t.pct_abstencao,
        "total_votes": t.votos_total,
        "valid_votes": t.votos_validos,
        "pct_valid": t.pct_validos,
        "blank_votes": t.brancos,
        "pct_blank": t.pct_brancos,
        "null_votes": t.nulos,
        "pct_null": t.pct_nulos,
        "mathematically_decided": res.matematicamente_definido,
        "final_tally": res.final,
        "leader_candidate_id": lider.sqcand if lider else None,
        "leader_votes": lider.votos if lider else 0,
        "leader_pct": lider.pct_validos if lider else 0.0,
        "second_candidate_id": segundo.sqcand if segundo else None,
        "second_votes": segundo.votos if segundo else 0,
        "second_pct": segundo.pct_validos if segundo else 0.0,
        "margin_pp": round((lider.pct_validos if lider else 0) - (segundo.pct_validos if segundo else 0), 4),
        "leader_party": partido_lider,
        "candidates": cands,
        "alliances": agrs,
    }


async def _upsert_candidatos(session: AsyncSession, ctx: Contexto, res: ResultadoTSE, vagas: int) -> None:
    sit = situacao.calcular(
        [
            {"sq": c.sqcand, "v": c.votos, "e": c.eleito, "st": c.situacao_tse, "d": c.destinacao}
            for c in res.candidatos
        ],
        vagas,
        res.final,
        res.matematicamente_definido,
        ctx.abrangencia_do_cargo,
    )
    linhas = []
    for c in res.candidatos:
        linhas.append(
            {
                "tse_candidate_id": c.sqcand,
                "election_id": ctx.eleicao_id,
                "round": ctx.turno,
                "office_code": ctx.cd_cargo,
                "state_code": "br" if ctx.cd_cargo == 1 else ctx.uf,
                "ballot_number": c.numero,
                "name": c.nome,
                "ballot_name": c.nome_urna,
                "party_abbreviation": c.partido_sigla,
                "party_number": c.partido_numero,
                "alliance": c.agremiacao,
                "color": cores.candidate_color(c.numero, c.partido_numero, c.partido_sigla),
                "vice_and_substitutes": [
                    {"nome": v.nome, "tipo": "vice" if v.tipo == "v" else "suplente"} for v in c.vices
                ],
                "overall_status": sit.get(c.sqcand, situacao.COUNTING),
                "elected": sit.get(c.sqcand) in (situacao.ELECTED, situacao.MATHEMATICALLY_ELECTED),
            }
        )
    for i in range(0, len(linhas), 500):
        stmt = insert(Candidate).values(linhas[i : i + 500])
        if ctx.abrangencia_do_cargo:
            stmt = stmt.on_conflict_do_update(
                index_elements=["tse_candidate_id"],
                set_={
                    c: getattr(stmt.excluded, c)
                    for c in (
                        "name",
                        "ballot_name",
                        "party_abbreviation",
                        "party_number",
                        "alliance",
                        "color",
                        "vice_and_substitutes",
                        "overall_status",
                        "elected",
                        "ballot_number",
                    )
                },
            )
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
        insert(ResultSnapshot)
        .values(**linha)
        .on_conflict_do_nothing(
            index_elements=["round", "office_code", "level", "geo_area_id", "generation_id"]
        )
        .returning(ResultSnapshot.id)
    )
    if snap.scalar_one_or_none() is None:
        await session.rollback()
        return None
    vagas_eff = vagas if sistema == "majoritario" else 0
    if ctx.abrangencia_do_cargo or any(c.sqcand not in _candidatos_conhecidos for c in res.candidatos):
        await _upsert_candidatos(session, ctx, res, vagas_eff or 0)
        _candidatos_conhecidos.update(c.sqcand for c in res.candidatos)
    anterior_dict = None
    if ctx.nivel in ("country", "state"):
        anterior = (
            await session.execute(
                select(CurrentResult).where(
                    CurrentResult.round == ctx.turno,
                    CurrentResult.office_code == ctx.cd_cargo,
                    CurrentResult.level == ctx.nivel,
                    CurrentResult.geo_area_id == ctx.recorte_id,
                )
            )
        ).scalar_one_or_none()
        anterior_dict = _como_dict(anterior) if anterior else None
    stmt = insert(CurrentResult).values(**linha)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=["round", "office_code", "level", "geo_area_id"],
            set_={
                k: getattr(stmt.excluded, k)
                for k in linha
                if k not in ("round", "office_code", "level", "geo_area_id")
            },
            where=(CurrentResult.tallied_at < stmt.excluded.tallied_at)
            | (
                (CurrentResult.tallied_at == stmt.excluded.tallied_at)
                & (CurrentResult.generation_id <= stmt.excluded.generation_id)
            ),
        )
    )
    if ctx.nivel == "municipality" and ctx.cd_cargo == 1:
        await session.execute(
            update(Municipality)
            .where(Municipality.id == ctx.recorte_id)
            .values(electorate=linha["electorate"])
        )
    await session.flush()
    return anterior_dict, linha


def _como_dict(obj: object) -> dict:
    return {c.key: getattr(obj, c.key) for c in obj.__table__.columns}  # type: ignore[attr-defined]


# ---------------------------------------------------------------- acompanhamento (EA14/EA15)


async def ingerir_progresso(
    session: AsyncSession,
    turno: int,
    acomp: AcompanhamentoTSE,
    uf_arquivo: str,
    capturado_em: datetime | None = None,
) -> list[dict]:
    mudou: list[dict] = []
    for item in acomp.itens:
        if item.tipo == "br":
            nivel, rid, uf = "country", "br", "br"
        elif item.tipo == "uf":
            nivel, rid, uf = "state", item.codigo, item.codigo
        else:
            nivel = "municipality"
            uf = uf_arquivo
            rid = item.codigo if item.codigo[:2].isalpha() else municipio_id(uf_arquivo, int(item.codigo))
        linha = {
            "round": turno,
            "level": nivel,
            "geo_area_id": rid,
            "state_code": uf,
            "generation_id": int(acomp.idg or 0),
            "tallied_at": item.totalizado_em,
            "captured_at": capturado_em or agora(),
            "progress_code": item.andamento,
            "sections_total": item.secoes_total,
            "sections_tallied": item.secoes_totalizadas,
            "pct_sections": item.pct_secoes,
            "electorate": item.eleitorado,
            "turnout": item.comparecimento,
            "pct_turnout": item.pct_comparecimento,
            "municipalities_completed": item.municipios_finalizados,
            "municipalities_partial": item.municipios_parciais,
            "municipalities_not_received": item.municipios_nao_recebidos,
        }
        atual = (
            await session.execute(
                select(CurrentProgress).where(
                    CurrentProgress.round == turno,
                    CurrentProgress.level == nivel,
                    CurrentProgress.geo_area_id == rid,
                )
            )
        ).scalar_one_or_none()
        if (
            atual is not None
            and atual.sections_tallied == item.secoes_totalizadas
            and atual.tallied_at == item.totalizado_em
        ):
            continue
        if nivel != "municipality":
            await session.execute(insert(ProgressSnapshot).values(**linha).on_conflict_do_nothing())
        stmt = insert(CurrentProgress).values(**linha)
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["round", "level", "geo_area_id"],
                set_={
                    k: getattr(stmt.excluded, k) for k in linha if k not in ("round", "level", "geo_area_id")
                },
            )
        )
        linha["anterior_secoes"] = atual.sections_tallied if atual else 0
        mudou.append(linha)
    await session.flush()
    return mudou


# ---------------------------------------------------------------- boletins de urna


async def mapa_numeros(session: AsyncSession, turno: int, uf: str) -> dict[tuple[int, int], str]:
    """(cd_cargo, numero) -> sqcand, para Presidente (uf=br) e cargos estaduais da UF."""
    res = await session.execute(
        select(Candidate.office_code, Candidate.ballot_number, Candidate.tse_candidate_id).where(
            Candidate.round == turno, Candidate.state_code.in_(["br", uf])
        )
    )
    return {(int(c), int(n)): sq for c, n, sq in res.all()}


@dataclass(frozen=True)
class BoletimContexto:
    """O que o worker sabe do arquivo antes de gravar o boletim de urna."""

    hash: str
    status: str
    totalizado_em: datetime | None
    url: str | None
    numeros: dict[tuple[int, int], str]


async def ingerir_boletim(
    session: AsyncSession,
    turno: int,
    uf: str,
    bu: BoletimUrna,
    ctx: BoletimContexto,
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
        votos[str(cargo.cd_cargo)] = {
            "comp": cargo.comparecimento,
            "b": cargo.brancos,
            "n": cargo.nulos,
            "nom": nom,
            "leg": leg,
        }
    mun = await session.get(Municipality, mid)
    if mun is None:
        return []
    if await session.get(PollingPlace, lid) is None:
        await session.execute(
            insert(PollingPlace)
            .values(
                id=lid,
                municipality_id=mid,
                electoral_zone_id=zid,
                state_code=uf,
                number=bu.local,
                name=f"LOCAL DE VOTAÇÃO {bu.local}",
                lat=mun.lat,
                lon=mun.lon,
                is_approximate=True,
                eligible_voters=0,
                section_count=0,
            )
            .on_conflict_do_nothing()
        )
        await session.execute(
            insert(ElectoralZone)
            .values(id=zid, municipality_id=mid, state_code=uf, number=bu.zona)
            .on_conflict_do_nothing()
        )
    await session.execute(
        insert(PollingSection)
        .values(
            id=sid,
            municipality_id=mid,
            electoral_zone_id=zid,
            polling_place_id=lid,
            state_code=uf,
            number=bu.secao,
            eligible_voters=bu.eleitores_aptos,
        )
        .on_conflict_do_update(index_elements=["id"], set_={"polling_place_id": lid})
    )
    linha = {
        "round": turno,
        "polling_section_id": sid,
        "polling_place_id": lid,
        "electoral_zone_id": zid,
        "municipality_id": mid,
        "state_code": uf,
        "hash": ctx.hash,
        "status": ctx.status,
        "tallied_at": ctx.totalizado_em,
        "issued_at": bu.emitido_em,
        "captured_at": agora(),
        "eligible_voters": bu.eleitores_aptos,
        "turnout": bu.comparecimento,
        "signature_valid": None,
        "url": ctx.url,
        "votes": votos,
    }
    stmt = insert(BallotBoxReport).values(**linha)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=["round", "polling_section_id"],
            set_={k: getattr(stmt.excluded, k) for k in linha if k not in ("round", "polling_section_id")},
        )
    )
    alterados = await recalcular_local(session, turno, lid, ctx.numeros)
    await session.flush()
    return alterados


async def recalcular_local(
    session: AsyncSession, turno: int, lid: str, numeros: dict[tuple[int, int], str]
) -> list[tuple[int, str]]:
    local = await session.get(PollingPlace, lid)
    if local is None:
        return []
    bols = (
        (
            await session.execute(
                select(BallotBoxReport).where(
                    BallotBoxReport.round == turno, BallotBoxReport.polling_place_id == lid
                )
            )
        )
        .scalars()
        .all()
    )
    total_secoes = (
        local.section_count
        or (
            await session.execute(
                select(func.count()).select_from(PollingSection).where(PollingSection.polling_place_id == lid)
            )
        ).scalar_one()
    )
    soma: dict[str, dict] = {}
    for b in bols:
        for cd, v in (b.votes or {}).items():
            s = soma.setdefault(cd, {"comp": 0, "b": 0, "n": 0, "nom": {}, "leg": {}, "secoes": 0})
            s["comp"] += v.get("comp", 0)
            s["b"] += v.get("b", 0)
            s["n"] += v.get("n", 0)
            s["secoes"] += 1
            for k in ("nom", "leg"):
                for num, q in (v.get(k) or {}).items():
                    s[k][num] = s[k].get(num, 0) + q
    alterados = []
    ultimo = max((b.tallied_at for b in bols if b.tallied_at), default=None)
    for cd, s in soma.items():
        cd_cargo = int(cd)
        validos = sum(s["nom"].values()) + sum(s["leg"].values())
        ordem = sorted(s["nom"].items(), key=lambda kv: -kv[1])
        lider = ordem[0] if ordem and ordem[0][1] > 0 else None
        segundo = ordem[1] if len(ordem) > 1 else None
        lider_pct = lider[1] * 100.0 / validos if lider and validos else 0.0
        seg_pct = segundo[1] * 100.0 / validos if segundo and validos else 0.0
        apuradas = s["secoes"]
        status = (
            "tallied"
            if total_secoes and apuradas >= total_secoes
            else ("partial" if apuradas else "not_received")
        )
        linha = {
            "round": turno,
            "office_code": cd_cargo,
            "polling_place_id": lid,
            "municipality_id": local.municipality_id,
            "state_code": local.state_code,
            "sections_total": max(total_secoes, apuradas),
            "sections_tallied": apuradas,
            "status": status,
            "turnout": s["comp"],
            "valid_votes": validos,
            "blank_votes": s["b"],
            "null_votes": s["n"],
            "leader_candidate_id": numeros.get((cd_cargo, int(lider[0]))) if lider else None,
            "leader_pct": round(lider_pct, 4),
            "margin_pp": round(lider_pct - seg_pct, 4),
            "votes": {"nom": s["nom"], "leg": s["leg"]},
            "updated_at": ultimo,
        }
        stmt = insert(PollingPlaceResult).values(**linha)
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["round", "office_code", "polling_place_id"],
                set_={
                    k: getattr(stmt.excluded, k)
                    for k in linha
                    if k not in ("round", "office_code", "polling_place_id")
                },
            )
        )
        alterados.append((cd_cargo, lid))
    return alterados
