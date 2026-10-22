"""Consultas de leitura: montam os payloads da API (os DTOs em schemas.py descrevem cada um).

Os nomes das chaves são os da API (inglês, glossário). Os valores de nível e de situação são os do
banco (inglês); o texto do produto (títulos, `Válido`, nomes de cargo) continua em português.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ballot_reports import BallotBoxReport, PollingPlaceResult
from app.modules.elections import Candidate, Election, ElectionOffice
from app.modules.elections import colors as cores
from app.modules.elections import status as situacao
from app.modules.events import Event
from app.modules.geography import (
    CHILD_LEVEL,
    ElectoralZone,
    GeoArea,
    Municipality,
    PollingPlace,
    PollingSection,
    State,
    parse,
)
from app.modules.results.models import CurrentProgress, CurrentResult, ProgressSnapshot, ResultSnapshot

NOT_RECEIVED = "not_received"
PARTIAL = "partial"
TALLIED = "tallied"


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def pct(parte: float, todo: float) -> float:
    return round(parte * 100.0 / todo, 4) if todo else 0.0


def status_por_pct(p: float | None, totalizadas: int | None = None) -> str:
    if not p and not totalizadas:
        return NOT_RECEIVED
    return TALLIED if (p or 0) >= 99.9999 else PARTIAL


# ------------------------------------------------------------------ cargos e eleições


async def cargo_info(
    session: AsyncSession, turno: int, cd_cargo: int
) -> tuple[Election, ElectionOffice] | None:
    res = await session.execute(
        select(Election, ElectionOffice)
        .join(ElectionOffice, ElectionOffice.election_id == Election.id)
        .where(Election.round == turno, ElectionOffice.office_code == cd_cargo)
        .order_by(Election.id.desc())
        .limit(1)
    )
    row = res.first()
    return (row[0], row[1]) if row else None


def cargo_json(c: ElectionOffice | None, cd: int) -> dict[str, Any]:
    if c is None:
        return {"office_code": cd, "name": f"Cargo {cd}", "voting_system": "majoritario", "seats": 1}
    return {"office_code": c.office_code, "name": c.name, "voting_system": c.voting_system, "seats": c.seats}


async def listar_eleicoes(session: AsyncSession) -> list[dict[str, Any]]:
    eleicoes = (await session.execute(select(Election).order_by(Election.round, Election.id))).scalars().all()
    return [
        {
            "id": e.id,
            "round": e.round,
            "cycle": e.cycle,
            "jurisdiction": e.jurisdiction,
            "name": e.name,
            "election_code": e.election_code,
            "offices": [
                {
                    "office_code": c.office_code,
                    "name": c.name,
                    "voting_system": c.voting_system,
                    "coverage": c.coverage,
                    "seats": c.seats,
                }
                for c in e.offices
            ],
        }
        for e in eleicoes
    ]


# ------------------------------------------------------------------ nomes e breadcrumb


async def nome_recorte(session: AsyncSession, r: GeoArea) -> str:
    if r.level == "country":
        return "Brasil"
    if r.level == "state":
        uf = await session.get(State, r.uf)
        return uf.name if uf else (r.uf or "").upper()
    if r.level == "municipality":
        m = await session.get(Municipality, r.id)
        return m.name if m else r.id
    if r.level == "zone":
        return f"Zona {r.zone}"
    if r.level == "polling_place":
        loc = await session.get(PollingPlace, r.id)
        return loc.name if loc else f"Local {r.polling_place}"
    return f"Seção {r.section}"


async def info_recorte(session: AsyncSession, r: GeoArea) -> dict[str, Any]:
    cadeia: list[GeoArea] = []
    atual: GeoArea | None = r
    while atual is not None:
        cadeia.append(atual)
        atual = atual.parent
    cadeia.reverse()
    if r.level == "section":
        sec = await session.get(PollingSection, r.id)
        if sec and sec.polling_place_id:
            cadeia.insert(len(cadeia) - 1, parse(sec.polling_place_id))
    bread = [{"level": x.level, "id": x.id, "name": await nome_recorte(session, x)} for x in cadeia]
    return {"level": r.level, "id": r.id, "name": bread[-1]["name"], "state_code": r.uf, "breadcrumb": bread}


# ------------------------------------------------------------------ linhas de resultado (TSE ou soma de BUs)


COLS_LEVES = [c for c in ResultSnapshot.__table__.columns if c.key not in ("candidates", "alliances", "id")]


def _row_dict(row: Row[Any]) -> dict[str, Any]:
    return dict(row._mapping)


async def linha_tse(
    session: AsyncSession, turno: int, cd: int, nivel: str, rid: str, t: datetime | None
) -> dict[str, Any] | None:
    if t is None:
        obj = (
            await session.execute(
                select(CurrentResult).where(
                    CurrentResult.round == turno,
                    CurrentResult.office_code == cd,
                    CurrentResult.level == nivel,
                    CurrentResult.geo_area_id == rid,
                )
            )
        ).scalar_one_or_none()
    else:
        obj = (
            await session.execute(
                select(ResultSnapshot)
                .where(
                    ResultSnapshot.round == turno,
                    ResultSnapshot.office_code == cd,
                    ResultSnapshot.level == nivel,
                    ResultSnapshot.geo_area_id == rid,
                    ResultSnapshot.tallied_at <= t,
                )
                .order_by(ResultSnapshot.tallied_at.desc(), ResultSnapshot.generation_id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if obj is None:
        return None
    return {c.key: getattr(obj, c.key) for c in obj.__table__.columns}


async def numeros_para_sq(session: AsyncSession, turno: int, cd: int, uf: str) -> dict[int, str]:
    res = await session.execute(
        select(Candidate.ballot_number, Candidate.tse_candidate_id).where(
            Candidate.round == turno,
            Candidate.office_code == cd,
            Candidate.state_code == ("br" if cd == 1 else uf),
        )
    )
    return {int(n): sq for n, sq in res.all()}


def soma_boletins(
    votos_por_bu: list[dict[str, Any]], aptos_total: int, secoes_total: int, mapa: dict[int, str]
) -> dict[str, Any]:
    nom: dict[str, int] = {}
    leg: dict[str, int] = {}
    comp = b = n = 0
    for v in votos_por_bu:
        if not v:
            continue
        comp += int(v.get("comp", 0))
        b += int(v.get("b", 0))
        n += int(v.get("n", 0))
        for k, q in (v.get("nom") or {}).items():
            nom[k] = nom.get(k, 0) + int(q)
        for k, q in (v.get("leg") or {}).items():
            leg[k] = leg.get(k, 0) + int(q)
    validos = sum(nom.values()) + sum(leg.values())
    cands = sorted(
        (
            {
                "sq": mapa.get(int(k), f"n{k}"),
                "v": q,
                "p": pct(q, validos),
                "e": False,
                "st": "",
                "d": "Válido",
                "num": int(k),
            }
            for k, q in nom.items()
        ),
        key=lambda c: -c["v"],
    )
    apuradas = len([v for v in votos_por_bu if v])
    tv = validos + b + n
    lider = cands[0] if cands and cands[0]["v"] > 0 else None
    segundo = cands[1] if len(cands) > 1 else None
    return {
        "source": "soma_bu",
        "electorate": aptos_total,
        "tallied_electorate": 0,
        "sections_total": max(secoes_total, apuradas),
        "sections_tallied": apuradas,
        "pct_sections": pct(apuradas, max(secoes_total, apuradas)),
        "turnout": comp,
        "pct_turnout": 0.0,
        "abstention": 0,
        "pct_abstention": 0.0,
        "total_votes": tv,
        "valid_votes": validos,
        "pct_valid": pct(validos, tv),
        "blank_votes": b,
        "pct_blank": pct(b, tv),
        "null_votes": n,
        "pct_null": pct(n, tv),
        "mathematically_decided": False,
        "final_tally": apuradas >= secoes_total > 0,
        "candidates": cands,
        "alliances": [],
        "leader_candidate_id": lider["sq"] if lider else None,
        "leader_votes": lider["v"] if lider else 0,
        "leader_pct": lider["p"] if lider else 0.0,
        "second_candidate_id": segundo["sq"] if segundo else None,
        "second_votes": segundo["v"] if segundo else 0,
        "second_pct": segundo["p"] if segundo else 0.0,
        "margin_pp": round((lider["p"] if lider else 0) - (segundo["p"] if segundo else 0), 4),
        "generation_id": 0,
        "tallied_at": None,
        "captured_at": None,
        "jws_verified": False,
        "leader_party": None,
    }


async def linha_bu(
    session: AsyncSession, turno: int, cd: int, r: GeoArea, t: datetime | None
) -> dict[str, Any] | None:
    """Resultado de zona/local/seção somando os boletins de urna coletados."""
    filtro = [BallotBoxReport.round == turno]
    if r.level == "section":
        filtro.append(BallotBoxReport.polling_section_id == r.id)
        secoes_total = 1
        sec = await session.get(PollingSection, r.id)
        aptos = sec.eligible_voters if sec and sec.eligible_voters else 0
    elif r.level == "polling_place":
        filtro.append(BallotBoxReport.polling_place_id == r.id)
        loc = await session.get(PollingPlace, r.id)
        secoes_total = loc.section_count if loc else 0
        aptos = loc.eligible_voters if loc else 0
    else:
        filtro.append(BallotBoxReport.electoral_zone_id == r.id)
        secoes_total = (
            await session.execute(
                select(func.count())
                .select_from(PollingSection)
                .where(PollingSection.electoral_zone_id == r.id)
            )
        ).scalar_one()
        aptos = (
            await session.execute(
                select(func.coalesce(func.sum(PollingSection.eligible_voters), 0)).where(
                    PollingSection.electoral_zone_id == r.id
                )
            )
        ).scalar_one()
    if t is not None:
        filtro.append(BallotBoxReport.tallied_at <= t)
    rows = (
        await session.execute(
            select(
                BallotBoxReport.votes[str(cd)],
                BallotBoxReport.tallied_at,
                BallotBoxReport.captured_at,
                BallotBoxReport.eligible_voters,
            ).where(*filtro)
        )
    ).all()
    if not rows and r.level == "section":
        return None
    mapa = await numeros_para_sq(session, turno, cd, r.uf or "br")
    linha = soma_boletins(
        [x[0] for x in rows], int(aptos or sum(x[3] or 0 for x in rows)), int(secoes_total), mapa
    )
    linha["tallied_electorate"] = sum(x[3] or 0 for x in rows)
    linha["abstention"] = max(0, linha["tallied_electorate"] - linha["turnout"])
    linha["pct_turnout"] = pct(linha["turnout"], linha["tallied_electorate"])
    linha["pct_abstention"] = pct(linha["abstention"], linha["tallied_electorate"])
    linha["tallied_at"] = max((x[1] for x in rows if x[1]), default=None)
    linha["captured_at"] = max((x[2] for x in rows if x[2]), default=None)
    return linha


async def obter_linha(
    session: AsyncSession, turno: int, cd: int, r: GeoArea, t: datetime | None
) -> dict[str, Any] | None:
    if r.level in ("country", "state", "municipality", "zone"):
        linha = await linha_tse(session, turno, cd, r.level, r.id, t)
        if linha is not None or r.level != "zone":
            return linha
    if r.level in ("zone", "polling_place", "section"):
        return await linha_bu(session, turno, cd, r, t)
    return None


# ------------------------------------------------------------------ candidatos (metadados)


async def meta_candidatos(session: AsyncSession, sqs: list[str]) -> dict[str, Candidate]:
    sqs = [s for s in set(sqs) if s]
    if not sqs:
        return {}
    res = await session.execute(select(Candidate).where(Candidate.tse_candidate_id.in_(sqs)))
    return {c.tse_candidate_id: c for c in res.scalars()}


def cand_curto(c: Candidate | None, sq: str | None, votos: int = 0, p: float = 0.0) -> dict[str, Any] | None:
    if sq is None:
        return None
    return {
        "tse_candidate_id": sq,
        "ballot_name": c.ballot_name if c else sq,
        "color": c.color if c else "#888888",
        "ballot_number": c.ballot_number if c else None,
        "party_abbreviation": c.party_abbreviation if c else "",
        "votes": votos,
        "pct": round(p, 4),
    }


def foto_url(sq: str) -> str:
    return f"/api/v1/candidates/{sq}/photo"


def _vices(lista: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [{"name": v.get("nome"), "kind": v.get("tipo")} for v in (lista or [])]


# ------------------------------------------------------------------ /results


async def montar_resultado(
    session: AsyncSession, turno: int, cd: int, r: GeoArea, t: datetime | None = None
) -> dict[str, Any]:
    info = await cargo_info(session, turno, cd)
    cargo_e = info[1] if info else None
    recorte = await info_recorte(session, r)
    base = {"geo_area": recorte, "office": cargo_json(cargo_e, cd)}
    linha = await obter_linha(session, turno, cd, r, t)
    if linha is None:
        return {"no_data": True, **base}
    sistema = cargo_e.voting_system if cargo_e else "majoritario"
    vagas = (cargo_e.seats or 1) if sistema == "majoritario" else 0
    abrangencia = (cd == 1 and r.level == "country") or (cd != 1 and r.level == "state")
    cands = linha.get("candidates") or []
    meta = await meta_candidatos(session, [c["sq"] for c in cands])
    sit = situacao.calcular(
        cands,
        vagas,
        bool(linha.get("final_tally")),
        bool(linha.get("mathematically_decided")),
        abrangencia,
    )
    candidatos = []
    for pos, c in enumerate(cands, start=1):
        m = meta.get(c["sq"])
        candidatos.append(
            {
                "tse_candidate_id": c["sq"],
                "ballot_number": m.ballot_number if m else c.get("num"),
                "name": m.name if m else c["sq"],
                "ballot_name": m.ballot_name if m else str(c.get("num", c["sq"])),
                "party_abbreviation": m.party_abbreviation if m else "",
                "party_number": m.party_number if m else None,
                "alliance": m.alliance if m else "",
                "color": m.color if m else "#888888",
                "photo_url": foto_url(c["sq"]),
                "votes": int(c["v"]),
                "valid_pct": float(c.get("p") or 0),
                "position": pos,
                "status": sit.get(c["sq"], situacao.COUNTING),
                "overall_status": m.overall_status if m else situacao.COUNTING,
                "elected": bool(m.elected) if m else False,
                "vote_destination": c.get("d") or "Válido",
                "vice_and_substitutes": _vices(m.vice_and_substitutes if m else []),
            }
        )
    agrs = []
    if sistema == "proporcional":
        for a in linha.get("alliances") or []:
            agrs.append(
                {
                    "name": a["nome"],
                    "parties": a.get("partidos", []),
                    "votes": a.get("v", 0),
                    "seats": a.get("vag"),
                    "color": cores.cor_texto(a["nome"]),
                }
            )
    lider = linha.get("leader_candidate_id")
    cobertura = None
    if linha.get("source") == "soma_bu":
        cobertura = {
            "total_sections": linha["sections_total"],
            "collected_sections": linha["sections_tallied"],
        }
    return {
        "no_data": False,
        **base,
        "source": linha.get("source", "tse"),
        "coverage": cobertura,
        "generation_id": str(linha.get("generation_id") or ""),
        "tallied_at": iso(linha.get("tallied_at")),
        "captured_at": iso(linha.get("captured_at")),
        "jws_verified": bool(linha.get("jws_verified")),
        "totals": {
            api: linha.get(interno, 0)
            for api, interno in (
                ("electorate", "electorate"),
                ("tallied_electorate", "tallied_electorate"),
                ("sections_total", "sections_total"),
                ("sections_tallied", "sections_tallied"),
                ("pct_sections", "pct_sections"),
                ("turnout", "turnout"),
                ("pct_turnout", "pct_turnout"),
                ("abstention", "abstention"),
                ("pct_abstention", "pct_abstention"),
                ("total_votes", "total_votes"),
                ("valid_votes", "valid_votes"),
                ("pct_valid", "pct_valid"),
                ("blank_votes", "blank_votes"),
                ("pct_blank", "pct_blank"),
                ("null_votes", "null_votes"),
                ("pct_null", "pct_null"),
            )
        },
        "mathematically_decided": bool(linha.get("mathematically_decided")),
        "final_tally": bool(linha.get("final_tally")),
        "leader": {
            "tse_candidate_id": lider,
            "margin_pp": linha.get("margin_pp", 0),
            "margin_votes": int(linha.get("leader_votes", 0)) - int(linha.get("second_votes", 0)),
        }
        if lider
        else None,
        "candidates": candidatos,
        "alliances": agrs,
    }


# ------------------------------------------------------------------ /results/series


async def serie(
    session: AsyncSession,
    turno: int,
    cd: int,
    r: GeoArea,
    de: datetime | None,
    ate: datetime | None,
    max_pontos: int = 300,
) -> dict[str, Any]:
    filtro = [
        ResultSnapshot.round == turno,
        ResultSnapshot.office_code == cd,
        ResultSnapshot.level == r.level,
        ResultSnapshot.geo_area_id == r.id,
    ]
    if de:
        filtro.append(ResultSnapshot.tallied_at >= de)
    if ate:
        filtro.append(ResultSnapshot.tallied_at <= ate)
    rows = (
        await session.execute(
            select(
                ResultSnapshot.tallied_at,
                ResultSnapshot.pct_sections,
                ResultSnapshot.valid_votes,
                ResultSnapshot.candidates,
            )
            .where(*filtro)
            .order_by(ResultSnapshot.tallied_at, ResultSnapshot.generation_id)
        )
    ).all()
    if len(rows) > max_pontos:
        passo = len(rows) / max_pontos
        idx = sorted({int(i * passo) for i in range(max_pontos)} | {len(rows) - 1})
        rows = [rows[i] for i in idx]
    ultimos = rows[-1][3] if rows else []
    top = [c["sq"] for c in ultimos[:12]]
    meta = await meta_candidatos(session, top)
    pontos = []
    for t, p, vv, cands in rows:
        mapa = {c["sq"]: c for c in cands}
        pontos.append(
            {
                "time": iso(t),
                "pct_sections": p,
                "valid_votes": vv,
                "candidates": {
                    sq: {"votes": mapa[sq]["v"], "pct": mapa[sq]["p"]} for sq in top if sq in mapa
                },
            }
        )
    candidatos = [
        {
            "tse_candidate_id": sq,
            "ballot_name": meta[sq].ballot_name if sq in meta else sq,
            "color": meta[sq].color if sq in meta else "#888",
            "ballot_number": meta[sq].ballot_number if sq in meta else None,
            "party_abbreviation": meta[sq].party_abbreviation if sq in meta else "",
        }
        for sq in top
    ]
    eventos = await listar_eventos(
        session, ConsultaEventos(turno=turno, limite=200, cargo=cd, nivel=r.level, recorte_id=r.id)
    )
    return {"candidates": candidatos, "points": pontos, "events": eventos}


# ------------------------------------------------------------------ /geo-areas/children


async def _linhas_nivel(
    session: AsyncSession,
    turno: int,
    cd: int,
    nivel: str,
    pai: str | None,
    t: datetime | None,
    com_candidatos: bool,
) -> dict[str, dict[str, Any]]:
    tabela = CurrentResult if t is None else ResultSnapshot
    cols = [
        c
        for c in tabela.__table__.columns
        if c.key not in ("alliances", "id") and (com_candidatos or c.key != "candidates")
    ]
    filtro = [tabela.round == turno, tabela.office_code == cd, tabela.level == nivel]
    if pai:
        filtro.append(tabela.parent_id == pai)
    if t is None:
        stmt = select(*cols).where(*filtro)
    else:
        filtro.append(tabela.tallied_at <= t)
        stmt = (
            select(*cols)
            .where(*filtro)
            .order_by(tabela.geo_area_id, tabela.tallied_at.desc(), tabela.generation_id.desc())
            .distinct(tabela.geo_area_id)
        )
    return {row.geo_area_id: _row_dict(row) for row in (await session.execute(stmt)).all()}


def montar_item(
    nivel_f: str, d: dict, ln: dict | None, meta: dict, candidatos: list[str] | None = None
) -> dict[str, Any]:
    item = {
        "level": nivel_f,
        "id": d["id"],
        "name": d["name"],
        "state_code": d.get("state_code"),
        "ibge_code": d.get("ibge_code"),
        "region": d.get("region"),
        "is_capital": d.get("is_capital", False),
        "lat": d.get("lat"),
        "lon": d.get("lon"),
        "status": NOT_RECEIVED,
        "pct_sections": 0.0,
        "electorate": d.get("electorate") or 0,
        "turnout": 0,
        "pct_abstention": 0.0,
        "valid_votes": 0,
        "blank_votes": 0,
        "null_votes": 0,
        "leader": None,
        "second": None,
        "margin_pp": 0.0,
        "leader_party": None,
        "values": {},
    }
    if not ln:
        return item
    lsq, ssq = ln.get("leader_candidate_id"), ln.get("second_candidate_id")
    item.update(
        {
            "status": status_por_pct(ln.get("pct_sections"), ln.get("sections_tallied")),
            "pct_sections": ln.get("pct_sections") or 0.0,
            "electorate": ln.get("electorate") or item["electorate"],
            "turnout": ln.get("turnout") or 0,
            "pct_abstention": ln.get("pct_abstention") or 0.0,
            "valid_votes": ln.get("valid_votes") or 0,
            "blank_votes": ln.get("blank_votes") or 0,
            "null_votes": ln.get("null_votes") or 0,
            "leader": cand_curto(meta.get(lsq), lsq, ln.get("leader_votes") or 0, ln.get("leader_pct") or 0)
            if lsq
            else None,
            "second": cand_curto(meta.get(ssq), ssq, ln.get("second_votes") or 0, ln.get("second_pct") or 0)
            if ssq
            else None,
            "margin_pp": ln.get("margin_pp") or 0.0,
        }
    )
    if ln.get("leader_party"):
        item["leader_party"] = {
            "abbreviation": ln["leader_party"],
            "color": cores.cor_texto(ln["leader_party"]),
        }
    if candidatos and ln.get("candidates") is not None:
        mapa = {c["sq"]: c.get("p", 0) for c in ln["candidates"]}
        item["values"] = {sq: mapa.get(sq, 0.0) for sq in candidatos}
    return item


async def _dimensao_uf(session: AsyncSession, turno: int, cd: int, t: datetime | None, com: bool) -> tuple:
    ufs = (await session.execute(select(State).order_by(State.code))).scalars().all()
    linhas = await _linhas_nivel(session, turno, cd, "state", None, t, com)
    dim = [
        {"id": u.code, "name": u.name, "state_code": u.code, "region": u.region}
        for u in ufs
        if u.code != "zz" or u.code in linhas
    ]
    return linhas, dim


async def _dimensao_municipios(
    session: AsyncSession, turno: int, cd: int, r: GeoArea, t: datetime | None, com: bool, regioes: dict
) -> tuple:
    q = select(Municipality)
    if r.level == "state":
        q = q.where(Municipality.state_code == r.uf)
    muns = (await session.execute(q.order_by(Municipality.name))).scalars().all()
    linhas = await _linhas_nivel(
        session, turno, cd, "municipality", r.uf if r.level == "state" else None, t, com
    )
    dim = [
        {
            "id": m.id,
            "name": m.name,
            "state_code": m.state_code,
            "ibge_code": m.ibge_code,
            "is_capital": m.is_capital,
            "lat": m.lat,
            "lon": m.lon,
            "region": regioes.get(m.state_code),
            "electorate": m.electorate,
        }
        for m in muns
    ]
    return linhas, dim


async def _dimensao_zonas(
    session: AsyncSession, turno: int, cd: int, r: GeoArea, t: datetime | None, com: bool, regioes: dict
) -> tuple:
    zonas = (
        (
            await session.execute(
                select(ElectoralZone)
                .where(ElectoralZone.municipality_id == r.id)
                .order_by(ElectoralZone.number)
            )
        )
        .scalars()
        .all()
    )
    linhas = await _linhas_nivel(session, turno, cd, "zone", r.id, t, com)
    for z in zonas:
        if z.id not in linhas:
            lb = await linha_bu(session, turno, cd, parse(z.id), t)
            if lb and lb["sections_tallied"]:
                linhas[z.id] = lb
    dim = [
        {
            "id": z.id,
            "name": f"Zona {z.number}",
            "state_code": z.state_code,
            "region": regioes.get(z.state_code),
        }
        for z in zonas
    ]
    return linhas, dim


async def _dimensao_locais(
    session: AsyncSession, turno: int, cd: int, r: GeoArea, t: datetime | None, regioes: dict
) -> tuple:
    locs = (
        (
            await session.execute(
                select(PollingPlace)
                .where(PollingPlace.electoral_zone_id == r.id)
                .order_by(PollingPlace.number)
            )
        )
        .scalars()
        .all()
    )
    linhas: dict[str, dict[str, Any]] = {}
    for loc in locs:
        lb = await linha_bu(session, turno, cd, parse(loc.id), t)
        if lb and lb["sections_tallied"]:
            linhas[loc.id] = lb
    dim = [
        {
            "id": loc.id,
            "name": loc.name,
            "state_code": loc.state_code,
            "lat": loc.lat,
            "lon": loc.lon,
            "region": regioes.get(loc.state_code),
            "electorate": loc.eligible_voters,
        }
        for loc in locs
    ]
    return linhas, dim


async def _dimensao_secoes(
    session: AsyncSession, turno: int, cd: int, r: GeoArea, t: datetime | None, regioes: dict
) -> tuple:
    secs = (
        (
            await session.execute(
                select(PollingSection)
                .where(PollingSection.polling_place_id == r.id)
                .order_by(PollingSection.number)
            )
        )
        .scalars()
        .all()
    )
    linhas: dict[str, dict[str, Any]] = {}
    for s in secs:
        lb = await linha_bu(session, turno, cd, parse(s.id), t)
        if lb:
            linhas[s.id] = lb
    dim = [
        {
            "id": s.id,
            "name": f"Seção {s.number}",
            "state_code": s.state_code,
            "region": regioes.get(s.state_code),
            "electorate": s.eligible_voters,
        }
        for s in secs
    ]
    return linhas, dim


async def filhos(
    session: AsyncSession,
    turno: int,
    cd: int,
    r: GeoArea,
    t: datetime | None,
    nivel_filhos: str | None = None,
    candidatos: list[str] | None = None,
) -> dict[str, Any]:
    nivel_f = nivel_filhos or CHILD_LEVEL.get(r.level)
    if nivel_f is None:
        return {"child_level": None, "candidates": [], "items": []}
    regioes = {u.code: u.region for u in (await session.execute(select(State))).scalars()}
    com = bool(candidatos)
    if nivel_f == "state":
        linhas, dim = await _dimensao_uf(session, turno, cd, t, com)
    elif nivel_f == "municipality":
        linhas, dim = await _dimensao_municipios(session, turno, cd, r, t, com, regioes)
    elif nivel_f == "zone":
        linhas, dim = await _dimensao_zonas(session, turno, cd, r, t, com, regioes)
    elif nivel_f == "polling_place":
        linhas, dim = await _dimensao_locais(session, turno, cd, r, t, regioes)
    elif nivel_f == "section":
        linhas, dim = await _dimensao_secoes(session, turno, cd, r, t, regioes)
    else:
        linhas, dim = {}, []
    sqs: list[str] = []
    for ln in linhas.values():
        sqs += [ln.get("leader_candidate_id"), ln.get("second_candidate_id")]
    sqs += candidatos or []
    meta = await meta_candidatos(session, [s for s in sqs if s])
    vitorias: dict[str, int] = {}
    itens: list[dict[str, Any]] = []
    for d in dim:
        ln = linhas.get(d["id"])
        item = montar_item(nivel_f, d, ln, meta, candidatos)
        if item["leader"]:
            vitorias[item["leader"]["tse_candidate_id"]] = (
                vitorias.get(item["leader"]["tse_candidate_id"], 0) + 1
            )
        itens.append(item)
    lista_cands = []
    for sq in set(list(vitorias) + (candidatos or [])):
        m = meta.get(sq)
        lista_cands.append(
            {
                "tse_candidate_id": sq,
                "ballot_name": m.ballot_name if m else sq,
                "color": m.color if m else "#888",
                "ballot_number": m.ballot_number if m else None,
                "party_abbreviation": m.party_abbreviation if m else "",
                "wins": vitorias.get(sq, 0),
            }
        )
    lista_cands.sort(key=lambda c: -c["wins"])
    return {"child_level": nivel_f, "candidates": lista_cands, "items": itens}


async def item_filho(session: AsyncSession, turno: int, cd: int, linha: dict) -> dict[str, Any]:
    """Item de /geo-areas/children para um único recorte (usado no tempo real)."""
    nivel = linha["level"]
    rid = linha["geo_area_id"]
    d: dict = {"id": rid, "name": rid, "state_code": linha.get("state_code")}
    if nivel == "state":
        u = await session.get(State, rid)
        d.update({"name": u.name if u else rid.upper(), "region": u.region if u else None})
    elif nivel == "municipality":
        m = await session.get(Municipality, rid)
        if m:
            u = await session.get(State, m.state_code)
            d.update(
                {
                    "name": m.name,
                    "ibge_code": m.ibge_code,
                    "is_capital": m.is_capital,
                    "lat": m.lat,
                    "lon": m.lon,
                    "region": u.region if u else None,
                    "electorate": m.electorate,
                }
            )
    elif nivel == "zone":
        d["name"] = f"Zona {int(rid[-4:])}"
    meta = await meta_candidatos(
        session,
        [x for x in (linha.get("leader_candidate_id"), linha.get("second_candidate_id")) if x],
    )
    return montar_item(nivel, d, linha, meta)


# ------------------------------------------------------------------ /progress


async def progresso(session: AsyncSession, turno: int, t: datetime | None) -> dict[str, Any]:
    if t is None:
        rows = (
            (
                await session.execute(
                    select(CurrentProgress).where(
                        CurrentProgress.round == turno, CurrentProgress.level.in_(["country", "state"])
                    )
                )
            )
            .scalars()
            .all()
        )
    else:
        rows = (
            (
                await session.execute(
                    select(ProgressSnapshot)
                    .where(
                        ProgressSnapshot.round == turno,
                        ProgressSnapshot.level.in_(["country", "state"]),
                        ProgressSnapshot.tallied_at <= t,
                    )
                    .order_by(ProgressSnapshot.geo_area_id, ProgressSnapshot.tallied_at.desc())
                    .distinct(ProgressSnapshot.geo_area_id)
                )
            )
            .scalars()
            .all()
        )
    nomes = {u.code: u.name for u in (await session.execute(select(State))).scalars()}
    total_mun = dict(
        (
            await session.execute(
                select(Municipality.state_code, func.count()).group_by(Municipality.state_code)
            )
        ).all()
    )
    br = next((x for x in rows if x.level == "country"), None)
    itens = [
        {
            "state_code": x.geo_area_id,
            "name": nomes.get(x.geo_area_id, x.geo_area_id.upper()),
            "pct_sections": x.pct_sections,
            "sections_total": x.sections_total,
            "sections_tallied": x.sections_tallied,
            "municipalities_total": total_mun.get(x.geo_area_id, 0),
            "municipalities_completed": x.municipalities_completed,
            "municipalities_partial": x.municipalities_partial,
            "municipalities_not_received": x.municipalities_not_received,
            "pct_turnout": x.pct_turnout,
            "tallied_at": iso(x.tallied_at),
        }
        for x in sorted(rows, key=lambda x: x.geo_area_id)
        if x.level == "state"
    ]
    return {
        "country": {
            "pct_sections": br.pct_sections if br else 0.0,
            "sections_total": br.sections_total if br else 0,
            "sections_tallied": br.sections_tallied if br else 0,
            "tallied_at": iso(br.tallied_at) if br else None,
        },
        "items": itens,
    }


# ------------------------------------------------------------------ locais de votação


@dataclass(frozen=True)
class ConsultaMapa:
    """Recorte geográfico pedido no mapa dos locais de votação."""

    uf: str | None = None
    municipio: str | None = None
    bbox: tuple[float, float, float, float] | None = None


@dataclass(frozen=True)
class ConsultaEventos:
    """Filtro da consulta de eventos."""

    turno: int = 1
    desde: datetime | None = None
    limite: int = 100
    tipos: list[str] | None = None
    cargo: int | None = None
    nivel: str | None = None
    recorte_id: str | None = None
    ate: datetime | None = None


async def _resultados_locais(
    session: AsyncSession, turno: int, cd: int, ids: list[str], t: datetime | None
) -> dict[str, dict[str, Any]]:
    res: dict[str, dict[str, Any]] = {}
    if t is None:
        for i in range(0, len(ids), 5000):
            rows = (
                await session.execute(
                    select(PollingPlaceResult).where(
                        PollingPlaceResult.round == turno,
                        PollingPlaceResult.office_code == cd,
                        PollingPlaceResult.polling_place_id.in_(ids[i : i + 5000]),
                    )
                )
            ).scalars()
            for x in rows:
                res[x.polling_place_id] = {
                    "sections_tallied": x.sections_tallied,
                    "sections_total": x.sections_total,
                    "leader": x.leader_candidate_id,
                    "pct": x.leader_pct,
                    "margin": x.margin_pp,
                    "valid": x.valid_votes,
                }
        return res
    mapas: dict[str, dict[int, str]] = {}
    for i in range(0, len(ids), 5000):
        rows = (
            await session.execute(
                select(
                    BallotBoxReport.polling_place_id,
                    BallotBoxReport.state_code,
                    BallotBoxReport.votes[str(cd)],
                ).where(
                    BallotBoxReport.round == turno,
                    BallotBoxReport.polling_place_id.in_(ids[i : i + 5000]),
                    BallotBoxReport.tallied_at <= t,
                )
            )
        ).all()
        por_local: dict[str, list] = {}
        ufs: dict[str, str] = {}
        for lid, u, v in rows:
            por_local.setdefault(lid, []).append(v)
            ufs[lid] = u
        for lid, votos in por_local.items():
            u = ufs[lid]
            if u not in mapas:
                mapas[u] = await numeros_para_sq(session, turno, cd, u)
            s = soma_boletins(votos, 0, 0, mapas[u])
            res[lid] = {
                "sections_tallied": s["sections_tallied"],
                "sections_total": 0,
                "leader": s["leader_candidate_id"],
                "pct": s["leader_pct"],
                "margin": s["margin_pp"],
                "valid": s["valid_votes"],
            }
    return res


def _filtro_mapa(filtro: ConsultaMapa) -> list:
    filtro_sql: list = []
    if filtro.uf:
        filtro_sql.append(PollingPlace.state_code == filtro.uf)
    if filtro.municipio:
        filtro_sql.append(PollingPlace.municipality_id == filtro.municipio)
    if filtro.bbox:
        b = filtro.bbox
        filtro_sql += [
            PollingPlace.lon >= b[0],
            PollingPlace.lat >= b[1],
            PollingPlace.lon <= b[2],
            PollingPlace.lat <= b[3],
        ]
    return filtro_sql


async def locais_mapa(
    session: AsyncSession,
    turno: int,
    cd: int,
    filtro: ConsultaMapa,
    t: datetime | None,
    limite: int = 20000,
) -> dict[str, Any]:
    filtro_sql = _filtro_mapa(filtro)
    total = (
        await session.execute(select(func.count()).select_from(PollingPlace).where(*filtro_sql))
    ).scalar_one()
    locs = (
        await session.execute(
            select(
                PollingPlace.id,
                PollingPlace.name,
                PollingPlace.neighborhood,
                PollingPlace.lat,
                PollingPlace.lon,
                PollingPlace.is_approximate,
                PollingPlace.section_count,
                PollingPlace.state_code,
            )
            .where(*filtro_sql)
            .limit(limite)
        )
    ).all()
    res = await _resultados_locais(session, turno, cd, [x.id for x in locs], t)
    meta = await meta_candidatos(session, [v["leader"] for v in res.values() if v.get("leader")])
    itens = []
    for x in locs:
        r = res.get(x.id)
        total_sec = max(
            x.section_count or 0, (r or {}).get("sections_total") or 0, (r or {}).get("sections_tallied") or 0
        )
        apuradas = (r or {}).get("sections_tallied", 0)
        lsq = (r or {}).get("leader")
        itens.append(
            {
                "id": x.id,
                "name": x.name,
                "neighborhood": x.neighborhood,
                "lat": x.lat,
                "lon": x.lon,
                "approximate": x.is_approximate,
                "status": _status_local(apuradas, total_sec),
                "sections_total": total_sec,
                "sections_tallied": apuradas,
                "leader": cand_curto(meta.get(lsq), lsq, 0, (r or {}).get("pct", 0)) if lsq else None,
                "margin_pp": (r or {}).get("margin", 0.0),
                "valid_votes": (r or {}).get("valid", 0),
            }
        )
    return {"total": total, "truncated": total > len(locs), "items": itens}


def _status_local(apuradas: int, total: int) -> str:
    if not apuradas:
        return NOT_RECEIVED
    return TALLIED if apuradas >= total else PARTIAL


async def item_local(session: AsyncSession, turno: int, cd: int, lid: str) -> dict[str, Any] | None:
    loc = await session.get(PollingPlace, lid)
    if loc is None:
        return None
    r = (
        await session.execute(
            select(PollingPlaceResult).where(
                PollingPlaceResult.round == turno,
                PollingPlaceResult.office_code == cd,
                PollingPlaceResult.polling_place_id == lid,
            )
        )
    ).scalar_one_or_none()
    lsq = r.leader_candidate_id if r else None
    meta = await meta_candidatos(session, [lsq] if lsq else [])
    apuradas = r.sections_tallied if r else 0
    total_sec = max(loc.section_count or 0, r.sections_total if r else 0)
    return {
        "id": loc.id,
        "name": loc.name,
        "neighborhood": loc.neighborhood,
        "lat": loc.lat,
        "lon": loc.lon,
        "approximate": loc.is_approximate,
        "status": _status_local(apuradas, total_sec),
        "sections_total": total_sec,
        "sections_tallied": apuradas,
        "leader": cand_curto(meta.get(lsq), lsq, 0, r.leader_pct) if r and lsq else None,
        "margin_pp": r.margin_pp if r else 0.0,
        "valid_votes": r.valid_votes if r else 0,
    }


async def detalhe_local(session: AsyncSession, turno: int, lid: str) -> dict[str, Any] | None:
    loc = await session.get(PollingPlace, lid)
    if loc is None:
        return None
    mun = await session.get(Municipality, loc.municipality_id)
    z = await session.get(ElectoralZone, loc.electoral_zone_id)
    secs = (
        (
            await session.execute(
                select(PollingSection)
                .where(PollingSection.polling_place_id == lid)
                .order_by(PollingSection.number)
            )
        )
        .scalars()
        .all()
    )
    bols = {
        b.polling_section_id: b
        for b in (
            await session.execute(
                select(BallotBoxReport).where(
                    BallotBoxReport.round == turno, BallotBoxReport.polling_place_id == lid
                )
            )
        ).scalars()
    }
    return {
        "id": loc.id,
        "name": loc.name,
        "address": loc.address,
        "neighborhood": loc.neighborhood,
        "zip_code": loc.zip_code,
        "lat": loc.lat,
        "lon": loc.lon,
        "approximate": loc.is_approximate,
        "eligible_voters": loc.eligible_voters,
        "municipality": {"id": loc.municipality_id, "name": mun.name if mun else loc.municipality_id},
        "zone": {"id": loc.electoral_zone_id, "number": z.number if z else None},
        "sections": [
            {
                "id": s.id,
                "number": s.number,
                "eligible_voters": s.eligible_voters,
                "status": TALLIED if s.id in bols else NOT_RECEIVED,
                "tallied_at": iso(bols[s.id].tallied_at) if s.id in bols else None,
                "turnout": bols[s.id].turnout if s.id in bols else None,
            }
            for s in secs
        ],
    }


NOMES_CARGO = {
    1: "Presidente",
    3: "Governador",
    5: "Senador",
    6: "Deputado Federal",
    7: "Deputado Estadual",
    8: "Deputado Distrital",
}


def _votos_secao(v: dict, por_num: dict) -> list[dict[str, Any]]:
    votos = []
    for num, q in sorted((v.get("nom") or {}).items(), key=lambda kv: -kv[1]):
        c = por_num.get(int(num))
        votos.append(
            {
                "kind": "nominal",
                "number": int(num),
                "tse_candidate_id": c.tse_candidate_id if c else None,
                "ballot_name": c.ballot_name if c else f"Nº {num}",
                "party_abbreviation": c.party_abbreviation if c else "",
                "color": c.color if c else "#888",
                "votes": q,
            }
        )
    for num, q in sorted((v.get("leg") or {}).items(), key=lambda kv: -kv[1]):
        votos.append(
            {
                "kind": "legenda",
                "number": int(num),
                "tse_candidate_id": None,
                "ballot_name": f"Legenda {num}",
                "party_abbreviation": "",
                "color": cores.cor_partido(int(num)),
                "votes": q,
            }
        )
    return votos


async def _cargos_secao(
    session: AsyncSession, turno: int, b: BallotBoxReport, uf: str
) -> list[dict[str, Any]]:
    cargos = []
    for cd, v in sorted((b.votes or {}).items(), key=lambda kv: int(kv[0])):
        cdi = int(cd)
        res = await session.execute(
            select(Candidate).where(
                Candidate.round == turno,
                Candidate.office_code == cdi,
                Candidate.state_code == ("br" if cdi == 1 else uf),
            )
        )
        por_num = {c.ballot_number: c for c in res.scalars()}
        votos = _votos_secao(v, por_num)
        cargos.append(
            {
                "office_code": cdi,
                "name": NOMES_CARGO.get(cdi, str(cdi)),
                "turnout": v.get("comp", 0),
                "valid_votes": sum(x["votes"] for x in votos),
                "blank_votes": v.get("b", 0),
                "null_votes": v.get("n", 0),
                "votes": votos,
            }
        )
    return cargos


async def detalhe_secao(session: AsyncSession, turno: int, sid: str) -> dict[str, Any] | None:
    r = parse(sid, "section")
    sec = await session.get(PollingSection, sid)
    b = (
        await session.execute(
            select(BallotBoxReport).where(
                BallotBoxReport.round == turno, BallotBoxReport.polling_section_id == sid
            )
        )
    ).scalar_one_or_none()
    if sec is None and b is None:
        return None
    mun = await session.get(Municipality, r.municipality_id)
    local_id = (sec.polling_place_id if sec else None) or (b.polling_place_id if b else None)
    loc = await session.get(PollingPlace, local_id) if local_id else None
    cargos = await _cargos_secao(session, turno, b, r.uf) if b else []
    return {
        "id": sid,
        "number": r.section,
        "state_code": r.uf,
        "municipality": {"id": r.municipality_id, "name": mun.name if mun else r.municipality_id},
        "zone": {"id": r.zone_id, "number": r.zone},
        "polling_place": {"id": local_id, "name": loc.name if loc else None},
        "status": TALLIED if b else NOT_RECEIVED,
        "tallied_at": iso(b.tallied_at) if b else None,
        "issued_at": iso(b.issued_at) if b else None,
        "hash": b.hash if b else None,
        "signature_valid": b.signature_valid if b else None,
        "bu_url": b.url if b else None,
        "eligible_voters": (sec.eligible_voters if sec else None) or (b.eligible_voters if b else None),
        "turnout": b.turnout if b else None,
        "offices": cargos,
    }


# ------------------------------------------------------------------ candidatos


def candidato_json(c: Candidate) -> dict[str, Any]:
    return {
        "tse_candidate_id": c.tse_candidate_id,
        "ballot_number": c.ballot_number,
        "name": c.name,
        "ballot_name": c.ballot_name,
        "party_abbreviation": c.party_abbreviation,
        "alliance": c.alliance,
        "color": c.color,
        "photo_url": foto_url(c.tse_candidate_id),
        "state_code": None if c.state_code == "br" else c.state_code,
        "office_code": c.office_code,
        "overall_status": c.overall_status,
        "elected": c.elected,
        "vice_and_substitutes": _vices(c.vice_and_substitutes),
    }


async def listar_candidatos(
    session: AsyncSession, turno: int, cd: int | None, uf: str | None
) -> list[dict[str, Any]]:
    q = select(Candidate).where(Candidate.round == turno)
    if cd:
        q = q.where(Candidate.office_code == cd)
    if uf:
        q = q.where(Candidate.state_code == uf)
    return [
        candidato_json(c)
        for c in (
            await session.execute(
                q.order_by(Candidate.office_code, Candidate.state_code, Candidate.ballot_number)
            )
        ).scalars()
    ]


async def detalhe_candidato(
    session: AsyncSession, sq: str, turno: int, t: datetime | None
) -> dict[str, Any] | None:
    c = await session.get(Candidate, sq)
    if c is None:
        return None
    info = await cargo_info(session, c.round, c.office_code)
    r = GeoArea("country", "br") if c.state_code == "br" else GeoArea("state", c.state_code, uf=c.state_code)
    res = await montar_resultado(session, c.round, c.office_code, r, t)
    meu = next((x for x in res.get("candidates", []) if x["tse_candidate_id"] == sq), None)
    return {
        **candidato_json(c),
        "office": cargo_json(info[1] if info else None, c.office_code),
        "result": {
            "votes": meu["votes"],
            "valid_pct": meu["valid_pct"],
            "position": meu["position"],
            "status": meu["status"],
        }
        if meu
        else None,
    }


# ------------------------------------------------------------------ busca


def sem_acento(texto: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", texto) if unicodedata.category(ch) != "Mn"
    ).lower()


async def buscar(session: AsyncSession, q: str, limite: int = 20) -> dict[str, Any]:
    q = q.strip()
    if len(q) < 2:
        return {"items": []}
    termo = f"%{sem_acento(q)}%"
    itens: list[dict[str, Any]] = []
    ufs = (
        (
            await session.execute(
                select(State).where(
                    or_(
                        func.unaccent(func.lower(State.name)).ilike(termo),
                        State.code == q.lower()[:2] if len(q) == 2 else False,
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    itens += [
        {"type": "state", "level": "state", "id": u.code, "title": u.name, "subtitle": u.code.upper()}
        for u in ufs
    ]
    muns = (
        (
            await session.execute(
                select(Municipality)
                .where(func.unaccent(func.lower(Municipality.name)).ilike(termo))
                .order_by(
                    Municipality.is_capital.desc(),
                    func.coalesce(Municipality.electorate, 0).desc(),
                    Municipality.name,
                )
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )
    itens += [
        {
            "type": "municipality",
            "level": "municipality",
            "id": m.id,
            "title": m.name,
            "subtitle": f"{m.state_code.upper()}"
            + (f" · {m.electorate:,} eleitores".replace(",", ".") if m.electorate else ""),
        }
        for m in muns
    ]
    numero = "".join(ch for ch in q if ch.isdigit())
    cand_filtro = [
        func.unaccent(func.lower(Candidate.ballot_name)).ilike(termo),
        func.unaccent(func.lower(Candidate.name)).ilike(termo),
    ]
    if numero and len(numero) == len(q.replace(" ", "")):
        cand_filtro.append(Candidate.ballot_number == int(numero))
    cands = (
        (
            await session.execute(
                select(Candidate).where(or_(*cand_filtro)).order_by(Candidate.office_code).limit(limite)
            )
        )
        .scalars()
        .all()
    )
    itens += [
        {
            "type": "candidate",
            "id": c.tse_candidate_id,
            "title": f"{c.ballot_name} ({c.ballot_number})",
            "subtitle": f"{NOMES_CARGO.get(c.office_code, c.office_code)} · {c.party_abbreviation}"
            + (f" · {c.state_code.upper()}" if c.state_code != "br" else ""),
            "office_code": c.office_code,
            "state_code": None if c.state_code == "br" else c.state_code,
        }
        for c in cands
    ]
    locs = (
        await session.execute(
            select(PollingPlace, Municipality.name)
            .join(Municipality, Municipality.id == PollingPlace.municipality_id)
            .where(
                or_(
                    func.unaccent(func.lower(PollingPlace.name)).ilike(termo),
                    func.unaccent(func.lower(PollingPlace.neighborhood)).ilike(termo),
                    func.unaccent(func.lower(PollingPlace.address)).ilike(termo),
                )
            )
            .limit(limite)
        )
    ).all()
    itens += [
        {
            "type": "polling_place",
            "level": "polling_place",
            "id": loc.id,
            "title": loc.name,
            "subtitle": f"{(loc.neighborhood or '').title()} · {mn}/{loc.state_code.upper()}",
        }
        for loc, mn in locs
    ]
    palavras = sem_acento(q).split()
    if numero and palavras and palavras[0] in ("zona", "z", "secao", "seção", "s"):
        cls = ElectoralZone if palavras[0].startswith("z") else PollingSection
        resto = " ".join(p for p in palavras[1:] if not p.isdigit())
        stmt = (
            select(cls, Municipality.name)
            .join(Municipality, Municipality.id == cls.municipality_id)
            .where(cls.number == int(numero))
        )
        if resto:
            stmt = stmt.where(func.unaccent(func.lower(Municipality.name)).ilike(f"%{resto}%"))
        for obj, mn in (await session.execute(stmt.limit(limite))).all():
            nivel = "zone" if cls is ElectoralZone else "section"
            itens.append(
                {
                    "type": nivel,
                    "level": nivel,
                    "id": obj.id,
                    "title": f"{'Zona' if nivel == 'zone' else 'Seção'} {obj.number}",
                    "subtitle": f"{mn}/{obj.state_code.upper()}",
                }
            )
    return {"items": itens[: limite * 3]}


# ------------------------------------------------------------------ eventos, linha do tempo, status


def evento_json(e: Event) -> dict[str, Any]:
    return {
        "id": e.id,
        "type": e.type,
        "occurred_at": iso(e.occurred_at),
        "office_code": e.office_code,
        "level": e.level,
        "geo_area_id": e.geo_area_id,
        "title": e.title,
        "description": e.description,
        "payload": e.payload,
    }


async def listar_eventos(session: AsyncSession, filtro: ConsultaEventos) -> list[dict[str, Any]]:
    q = select(Event).where(Event.round == filtro.turno)
    if filtro.desde:
        q = q.where(Event.occurred_at > filtro.desde)
    if filtro.ate:
        q = q.where(Event.occurred_at <= filtro.ate)
    if filtro.tipos:
        q = q.where(Event.type.in_(filtro.tipos))
    if filtro.cargo:
        q = q.where(or_(Event.office_code == filtro.cargo, Event.office_code.is_(None)))
    if filtro.nivel and filtro.recorte_id:
        q = q.where(
            or_(
                and_(Event.level == filtro.nivel, Event.geo_area_id == filtro.recorte_id),
                Event.type == "start",
            )
        )
    rows = (
        (await session.execute(q.order_by(Event.occurred_at.desc(), Event.id.desc()).limit(filtro.limite)))
        .scalars()
        .all()
    )
    return [evento_json(e) for e in rows]


async def linha_do_tempo(session: AsyncSession, turno: int) -> dict[str, Any]:
    ini, fim = (
        await session.execute(
            select(func.min(ResultSnapshot.tallied_at), func.max(ResultSnapshot.tallied_at)).where(
                ResultSnapshot.round == turno, ResultSnapshot.level.in_(["country", "state"])
            )
        )
    ).one()
    eventos = await listar_eventos(session, ConsultaEventos(turno=turno, limite=300))
    eventos = [e for e in eventos if e["level"] in ("country", "state", None)]
    return {"start": iso(ini), "end": iso(fim), "now": iso(fim), "events": eventos}


async def ultima_totalizacao(session: AsyncSession) -> datetime | None:
    return (
        await session.execute(
            select(func.max(CurrentResult.tallied_at)).where(CurrentResult.level == "country")
        )
    ).scalar_one()


async def pct_br(session: AsyncSession, turno: int = 1) -> float:
    r = (
        await session.execute(
            select(CurrentProgress.pct_sections).where(
                CurrentProgress.round == turno, CurrentProgress.level == "country"
            )
        )
    ).scalar_one_or_none()
    return float(r or 0.0)
