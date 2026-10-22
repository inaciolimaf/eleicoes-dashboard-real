"""Consultas de leitura: montam os payloads do contrato da API (docs/11-contrato-api.md)."""

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
    FILHO,
    ElectoralZone,
    Municipality,
    PollingPlace,
    PollingSection,
    Recorte,
    State,
    parse,
)
from app.modules.results.models import CurrentProgress, CurrentResult, ProgressSnapshot, ResultSnapshot


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def pct(parte: float, todo: float) -> float:
    return round(parte * 100.0 / todo, 4) if todo else 0.0


def status_por_pct(p: float | None, totalizadas: int | None = None) -> str:
    if not p and not totalizadas:
        return "nao_recebido"
    return "apurado" if (p or 0) >= 99.9999 else "parcial"


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


def cargo_json(c: ElectionOffice | None, cd: int) -> dict:
    if c is None:
        return {"cd": cd, "nome": f"Cargo {cd}", "sistema": "majoritario", "vagas": 1}
    return {"cd": c.office_code, "nome": c.name, "sistema": c.voting_system, "vagas": c.seats}


async def listar_eleicoes(session: AsyncSession) -> list[dict]:
    eleicoes = (await session.execute(select(Election).order_by(Election.round, Election.id))).scalars().all()
    return [
        {
            "id": e.id,
            "turno": e.round,
            "ciclo": e.cycle,
            "tipo": e.jurisdiction,
            "nome": e.name,
            "cd_eleicao": e.election_code,
            "cargos": [
                {
                    "cd": c.office_code,
                    "nome": c.name,
                    "sistema": c.voting_system,
                    "abrangencia": c.coverage,
                    "vagas": c.seats,
                }
                for c in e.offices
            ],
        }
        for e in eleicoes
    ]


# ------------------------------------------------------------------ nomes e breadcrumb


async def nome_recorte(session: AsyncSession, r: Recorte) -> str:
    if r.nivel == "br":
        return "Brasil"
    if r.nivel == "uf":
        uf = await session.get(State, r.uf)
        return uf.name if uf else (r.uf or "").upper()
    if r.nivel == "municipio":
        m = await session.get(Municipality, r.id)
        return m.name if m else r.id
    if r.nivel == "zona":
        return f"Zona {r.zona}"
    if r.nivel == "local":
        loc = await session.get(PollingPlace, r.id)
        return loc.name if loc else f"Local {r.local}"
    return f"Seção {r.secao}"


async def info_recorte(session: AsyncSession, r: Recorte) -> dict:
    cadeia: list[Recorte] = []
    atual: Recorte | None = r
    while atual is not None:
        cadeia.append(atual)
        atual = atual.pai
    cadeia.reverse()
    if r.nivel == "secao":
        sec = await session.get(PollingSection, r.id)
        if sec and sec.polling_place_id:
            cadeia.insert(len(cadeia) - 1, parse(sec.polling_place_id))
    bread = [{"nivel": x.nivel, "id": x.id, "nome": await nome_recorte(session, x)} for x in cadeia]
    return {"nivel": r.nivel, "id": r.id, "nome": bread[-1]["nome"], "uf": r.uf, "breadcrumb": bread}


# ------------------------------------------------------------------ linhas de resultado (TSE ou soma de BUs)


COLS_LEVES = [c for c in ResultSnapshot.__table__.columns if c.key not in ("candidates", "alliances", "id")]


def _row_dict(row: Row[Any]) -> dict:
    return dict(row._mapping)


async def linha_tse(
    session: AsyncSession, turno: int, cd: int, nivel: str, rid: str, t: datetime | None
) -> dict | None:
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
    votos_por_bu: list[dict], aptos_total: int, secoes_total: int, mapa: dict[int, str]
) -> dict:
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


async def linha_bu(session: AsyncSession, turno: int, cd: int, r: Recorte, t: datetime | None) -> dict | None:
    """Resultado de zona/local/seção somando os boletins de urna coletados."""
    filtro = [BallotBoxReport.round == turno]
    if r.nivel == "secao":
        filtro.append(BallotBoxReport.polling_section_id == r.id)
        secoes_total = 1
        sec = await session.get(PollingSection, r.id)
        aptos = sec.eligible_voters if sec and sec.eligible_voters else 0
    elif r.nivel == "local":
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
    if not rows and r.nivel == "secao":
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
    session: AsyncSession, turno: int, cd: int, r: Recorte, t: datetime | None
) -> dict | None:
    if r.nivel in ("br", "uf", "municipio", "zona"):
        rid = r.id
        linha = await linha_tse(session, turno, cd, r.nivel, rid, t)
        if linha is not None or r.nivel != "zona":
            return linha
    if r.nivel in ("zona", "local", "secao"):
        return await linha_bu(session, turno, cd, r, t)
    return None


# ------------------------------------------------------------------ candidatos (metadados)


async def meta_candidatos(session: AsyncSession, sqs: list[str]) -> dict[str, Candidate]:
    sqs = [s for s in set(sqs) if s]
    if not sqs:
        return {}
    res = await session.execute(select(Candidate).where(Candidate.tse_candidate_id.in_(sqs)))
    return {c.tse_candidate_id: c for c in res.scalars()}


def cand_curto(c: Candidate | None, sq: str | None, votos: int = 0, p: float = 0.0) -> dict | None:
    if sq is None:
        return None
    return {
        "sqcand": sq,
        "nome_urna": c.ballot_name if c else sq,
        "cor": c.color if c else "#888888",
        "numero": c.ballot_number if c else None,
        "partido_sigla": c.party_abbreviation if c else "",
        "votos": votos,
        "pct": round(p, 4),
    }


def foto_url(sq: str) -> str:
    return f"/api/v1/fotos/{sq}"


# ------------------------------------------------------------------ /resultados


async def montar_resultado(
    session: AsyncSession, turno: int, cd: int, r: Recorte, t: datetime | None = None
) -> dict:
    info = await cargo_info(session, turno, cd)
    cargo_e = info[1] if info else None
    recorte = await info_recorte(session, r)
    base = {"recorte": recorte, "cargo": cargo_json(cargo_e, cd)}
    linha = await obter_linha(session, turno, cd, r, t)
    if (
        linha is None
        or (linha.get("source") == "soma_bu" and linha["sections_tallied"] == 0 and r.nivel != "zona")
    ) and linha is None:
        return {"sem_dados": True, **base}
    sistema = cargo_e.voting_system if cargo_e else "majoritario"
    vagas = (cargo_e.seats or 1) if sistema == "majoritario" else 0
    abrangencia = (cd == 1 and r.nivel == "br") or (cd != 1 and r.nivel == "uf")
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
                "sqcand": c["sq"],
                "numero": m.ballot_number if m else c.get("num"),
                "nome": m.name if m else c["sq"],
                "nome_urna": m.ballot_name if m else str(c.get("num", c["sq"])),
                "partido_sigla": m.party_abbreviation if m else "",
                "partido_numero": m.party_number if m else None,
                "agremiacao": m.alliance if m else "",
                "cor": m.color if m else "#888888",
                "foto_url": foto_url(c["sq"]),
                "votos": int(c["v"]),
                "pct_validos": float(c.get("p") or 0),
                "posicao": pos,
                "situacao": sit.get(c["sq"], situacao.EM_APURACAO),
                "situacao_geral": m.overall_status if m else situacao.EM_APURACAO,
                "eleito": bool(m.elected) if m else False,
                "destinacao": c.get("d") or "Válido",
                "vices": m.vice_and_substitutes if m else [],
            }
        )
    agrs = []
    if sistema == "proporcional":
        for a in linha.get("alliances") or []:
            agrs.append(
                {
                    "nome": a["nome"],
                    "partidos": a.get("partidos", []),
                    "votos": a.get("v", 0),
                    "vagas": a.get("vag"),
                    "cor": cores.cor_texto(a["nome"]),
                }
            )
    lider = linha.get("leader_candidate_id")
    cobertura = None
    if linha.get("source") == "soma_bu":
        cobertura = {
            "secoes_total": linha["sections_total"],
            "secoes_coletadas": linha["sections_tallied"],
        }
    return {
        "sem_dados": False,
        **base,
        "fonte": linha.get("source", "tse"),
        "cobertura": cobertura,
        "idg": str(linha.get("generation_id") or ""),
        "totalizado_em": iso(linha.get("tallied_at")),
        "capturado_em": iso(linha.get("captured_at")),
        "jws_verificado": bool(linha.get("jws_verified")),
        "totais": {
            api: linha.get(interno, 0)
            for api, interno in (
                ("eleitorado", "electorate"),
                ("eleitorado_apurado", "tallied_electorate"),
                ("secoes_total", "sections_total"),
                ("secoes_totalizadas", "sections_tallied"),
                ("pct_secoes", "pct_sections"),
                ("comparecimento", "turnout"),
                ("pct_comparecimento", "pct_turnout"),
                ("abstencao", "abstention"),
                ("pct_abstencao", "pct_abstention"),
                ("votos_total", "total_votes"),
                ("votos_validos", "valid_votes"),
                ("pct_validos", "pct_valid"),
                ("brancos", "blank_votes"),
                ("pct_brancos", "pct_blank"),
                ("nulos", "null_votes"),
                ("pct_nulos", "pct_null"),
            )
        },
        "matematicamente_definido": bool(linha.get("mathematically_decided")),
        "totalizacao_final": bool(linha.get("final_tally")),
        "lider": {
            "sqcand": lider,
            "margem_pp": linha.get("margin_pp", 0),
            "margem_votos": int(linha.get("leader_votes", 0)) - int(linha.get("second_votes", 0)),
        }
        if lider
        else None,
        "candidatos": candidatos,
        "agremiacoes": agrs,
    }


# ------------------------------------------------------------------ /resultados/serie


async def serie(
    session: AsyncSession,
    turno: int,
    cd: int,
    r: Recorte,
    de: datetime | None,
    ate: datetime | None,
    max_pontos: int = 300,
) -> dict:
    filtro = [
        ResultSnapshot.round == turno,
        ResultSnapshot.office_code == cd,
        ResultSnapshot.level == r.nivel,
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
                "t": iso(t),
                "pct_secoes": p,
                "votos_validos": vv,
                "candidatos": {
                    sq: {"votos": mapa[sq]["v"], "pct": mapa[sq]["p"]} for sq in top if sq in mapa
                },
            }
        )
    candidatos = [
        {
            "sqcand": sq,
            "nome_urna": meta[sq].ballot_name if sq in meta else sq,
            "cor": meta[sq].color if sq in meta else "#888",
            "numero": meta[sq].ballot_number if sq in meta else None,
            "partido_sigla": meta[sq].party_abbreviation if sq in meta else "",
        }
        for sq in top
    ]
    eventos = await listar_eventos(
        session, ConsultaEventos(turno=turno, limite=200, cargo=cd, nivel=r.nivel, recorte_id=r.id)
    )
    return {"candidatos": candidatos, "pontos": pontos, "eventos": eventos}


# ------------------------------------------------------------------ /recortes/filhos


async def _linhas_nivel(
    session: AsyncSession,
    turno: int,
    cd: int,
    nivel: str,
    pai: str | None,
    t: datetime | None,
    com_candidatos: bool,
) -> dict[str, dict]:
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
) -> dict:
    item = {
        "nivel": nivel_f,
        "id": d["id"],
        "nome": d["nome"],
        "uf": d.get("uf"),
        "cd_ibge": d.get("cd_ibge"),
        "regiao": d.get("regiao"),
        "capital": d.get("capital", False),
        "lat": d.get("lat"),
        "lon": d.get("lon"),
        "status": "nao_recebido",
        "pct_secoes": 0.0,
        "eleitorado": d.get("eleitorado") or 0,
        "comparecimento": 0,
        "pct_abstencao": 0.0,
        "votos_validos": 0,
        "brancos": 0,
        "nulos": 0,
        "lider": None,
        "segundo": None,
        "margem_pp": 0.0,
        "partido_lider": None,
        "valores": {},
    }
    if not ln:
        return item
    lsq, ssq = ln.get("leader_candidate_id"), ln.get("second_candidate_id")
    item.update(
        {
            "status": status_por_pct(ln.get("pct_sections"), ln.get("sections_tallied")),
            "pct_secoes": ln.get("pct_sections") or 0.0,
            "eleitorado": ln.get("electorate") or item["eleitorado"],
            "comparecimento": ln.get("turnout") or 0,
            "pct_abstencao": ln.get("pct_abstention") or 0.0,
            "votos_validos": ln.get("valid_votes") or 0,
            "brancos": ln.get("blank_votes") or 0,
            "nulos": ln.get("null_votes") or 0,
            "lider": cand_curto(meta.get(lsq), lsq, ln.get("leader_votes") or 0, ln.get("leader_pct") or 0)
            if lsq
            else None,
            "segundo": cand_curto(meta.get(ssq), ssq, ln.get("second_votes") or 0, ln.get("second_pct") or 0)
            if ssq
            else None,
            "margem_pp": ln.get("margin_pp") or 0.0,
        }
    )
    if ln.get("leader_party"):
        item["partido_lider"] = {"sigla": ln["leader_party"], "cor": cores.cor_texto(ln["leader_party"])}
    if candidatos and ln.get("candidates") is not None:
        mapa = {c["sq"]: c.get("p", 0) for c in ln["candidates"]}
        item["valores"] = {sq: mapa.get(sq, 0.0) for sq in candidatos}
    return item


async def filhos(
    session: AsyncSession,
    turno: int,
    cd: int,
    r: Recorte,
    t: datetime | None,
    nivel_filhos: str | None = None,
    candidatos: list[str] | None = None,
) -> dict:
    nivel_f = nivel_filhos or FILHO.get(r.nivel)
    if nivel_f is None:
        return {"nivel_filhos": None, "candidatos": [], "itens": []}
    itens: list[dict] = []
    linhas: dict[str, dict] = {}
    dim: list[dict] = []
    regioes = {u.code: u.region for u in (await session.execute(select(State))).scalars()}
    if nivel_f == "uf":
        ufs = (await session.execute(select(State).order_by(State.code))).scalars().all()
        linhas = await _linhas_nivel(session, turno, cd, "uf", None, t, bool(candidatos))
        dim = [
            {"id": u.code, "nome": u.name, "uf": u.code, "regiao": u.region}
            for u in ufs
            if u.code != "zz" or u.code in linhas
        ]
    elif nivel_f == "municipio":
        q = select(Municipality)
        if r.nivel == "uf":
            q = q.where(Municipality.state_code == r.uf)
        muns = (await session.execute(q.order_by(Municipality.name))).scalars().all()
        linhas = await _linhas_nivel(
            session, turno, cd, "municipio", r.uf if r.nivel == "uf" else None, t, bool(candidatos)
        )
        dim = [
            {
                "id": m.id,
                "nome": m.name,
                "uf": m.state_code,
                "cd_ibge": m.ibge_code,
                "capital": m.is_capital,
                "lat": m.lat,
                "lon": m.lon,
                "regiao": regioes.get(m.state_code),
                "eleitorado": m.electorate,
            }
            for m in muns
        ]
    elif nivel_f == "zona":
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
        linhas = await _linhas_nivel(session, turno, cd, "zona", r.id, t, bool(candidatos))
        for z in zonas:
            if z.id not in linhas:
                lb = await linha_bu(session, turno, cd, parse(z.id), t)
                if lb and lb["sections_tallied"]:
                    linhas[z.id] = lb
        dim = [
            {"id": z.id, "nome": f"Zona {z.number}", "uf": z.state_code, "regiao": regioes.get(z.state_code)}
            for z in zonas
        ]
    elif nivel_f == "local":
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
        for loc in locs:
            lb = await linha_bu(session, turno, cd, parse(loc.id), t)
            if lb and lb["sections_tallied"]:
                linhas[loc.id] = lb
        dim = [
            {
                "id": loc.id,
                "nome": loc.name,
                "uf": loc.state_code,
                "lat": loc.lat,
                "lon": loc.lon,
                "regiao": regioes.get(loc.state_code),
                "eleitorado": loc.eligible_voters,
            }
            for loc in locs
        ]
    elif nivel_f == "secao":
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
        for s in secs:
            lb = await linha_bu(session, turno, cd, parse(s.id), t)
            if lb:
                linhas[s.id] = lb
        dim = [
            {
                "id": s.id,
                "nome": f"Seção {s.number}",
                "uf": s.state_code,
                "regiao": regioes.get(s.state_code),
                "eleitorado": s.eligible_voters,
            }
            for s in secs
        ]
    sqs: list[str] = []
    for ln in linhas.values():
        sqs += [ln.get("leader_candidate_id"), ln.get("second_candidate_id")]
    sqs += candidatos or []
    meta = await meta_candidatos(session, [s for s in sqs if s])
    vitorias: dict[str, int] = {}
    for d in dim:
        ln = linhas.get(d["id"])
        item = montar_item(nivel_f, d, ln, meta, candidatos)
        if item["lider"]:
            vitorias[item["lider"]["sqcand"]] = vitorias.get(item["lider"]["sqcand"], 0) + 1
        itens.append(item)
    lista_cands = []
    for sq in set(list(vitorias) + (candidatos or [])):
        m = meta.get(sq)
        lista_cands.append(
            {
                "sqcand": sq,
                "nome_urna": m.ballot_name if m else sq,
                "cor": m.color if m else "#888",
                "numero": m.ballot_number if m else None,
                "partido_sigla": m.party_abbreviation if m else "",
                "vitorias": vitorias.get(sq, 0),
            }
        )
    lista_cands.sort(key=lambda c: -c["vitorias"])
    return {"nivel_filhos": nivel_f, "candidatos": lista_cands, "itens": itens}


async def item_filho(session: AsyncSession, turno: int, cd: int, linha: dict) -> dict:
    """Item de /recortes/filhos para um único recorte (usado no tempo real)."""
    nivel = linha["level"]
    rid = linha["geo_area_id"]
    d: dict = {"id": rid, "nome": rid, "uf": linha.get("state_code")}
    if nivel == "uf":
        u = await session.get(State, rid)
        d.update({"nome": u.name if u else rid.upper(), "regiao": u.region if u else None})
    elif nivel == "municipio":
        m = await session.get(Municipality, rid)
        if m:
            u = await session.get(State, m.state_code)
            d.update(
                {
                    "nome": m.name,
                    "cd_ibge": m.ibge_code,
                    "capital": m.is_capital,
                    "lat": m.lat,
                    "lon": m.lon,
                    "regiao": u.region if u else None,
                    "eleitorado": m.electorate,
                }
            )
    elif nivel == "zona":
        d["nome"] = f"Zona {int(rid[-4:])}"
    meta = await meta_candidatos(
        session,
        [x for x in (linha.get("leader_candidate_id"), linha.get("second_candidate_id")) if x],
    )
    return montar_item(nivel, d, linha, meta)


# ------------------------------------------------------------------ /progresso


async def progresso(session: AsyncSession, turno: int, t: datetime | None) -> dict:
    if t is None:
        rows = (
            (
                await session.execute(
                    select(CurrentProgress).where(
                        CurrentProgress.round == turno, CurrentProgress.level.in_(["br", "uf"])
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
                        ProgressSnapshot.level.in_(["br", "uf"]),
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
    br = next((x for x in rows if x.level == "br"), None)
    itens = [
        {
            "uf": x.geo_area_id,
            "nome": nomes.get(x.geo_area_id, x.geo_area_id.upper()),
            "pct_secoes": x.pct_sections,
            "secoes_total": x.sections_total,
            "secoes_totalizadas": x.sections_tallied,
            "municipios_total": total_mun.get(x.geo_area_id, 0),
            "municipios_finalizados": x.municipalities_completed,
            "municipios_parciais": x.municipalities_partial,
            "municipios_nao_recebidos": x.municipalities_not_received,
            "pct_comparecimento": x.pct_turnout,
            "atualizado_em": iso(x.tallied_at),
        }
        for x in sorted(rows, key=lambda x: x.geo_area_id)
        if x.level == "uf"
    ]
    return {
        "br": {
            "pct_secoes": br.pct_sections if br else 0.0,
            "secoes_total": br.sections_total if br else 0,
            "secoes_totalizadas": br.sections_tallied if br else 0,
            "atualizado_em": iso(br.tallied_at) if br else None,
        },
        "itens": itens,
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


async def locais_mapa(
    session: AsyncSession,
    turno: int,
    cd: int,
    filtro: ConsultaMapa,
    t: datetime | None,
    limite: int = 20000,
) -> dict:
    uf = filtro.uf
    municipio = filtro.municipio
    bbox = filtro.bbox
    filtro_sql = []
    if uf:
        filtro_sql.append(PollingPlace.state_code == uf)
    if municipio:
        filtro_sql.append(PollingPlace.municipality_id == municipio)
    if bbox:
        filtro_sql += [
            PollingPlace.lon >= bbox[0],
            PollingPlace.lat >= bbox[1],
            PollingPlace.lon <= bbox[2],
            PollingPlace.lat <= bbox[3],
        ]
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
    ids = [x.id for x in locs]
    res: dict[str, dict] = {}
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
                    "secoes_apuradas": x.sections_tallied,
                    "secoes_total": x.sections_total,
                    "lider": x.leader_candidate_id,
                    "pct": x.leader_pct,
                    "margem": x.margin_pp,
                    "validos": x.valid_votes,
                }
    else:
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
                    "secoes_apuradas": s["sections_tallied"],
                    "secoes_total": 0,
                    "lider": s["leader_candidate_id"],
                    "pct": s["leader_pct"],
                    "margem": s["margin_pp"],
                    "validos": s["valid_votes"],
                }
    meta = await meta_candidatos(session, [v["lider"] for v in res.values() if v.get("lider")])
    itens = []
    for x in locs:
        r = res.get(x.id)
        total_sec = max(
            x.section_count or 0, (r or {}).get("secoes_total") or 0, (r or {}).get("secoes_apuradas") or 0
        )
        apuradas = (r or {}).get("secoes_apuradas", 0)
        status = "nao_recebido" if not apuradas else ("apurado" if apuradas >= total_sec else "parcial")
        lsq = (r or {}).get("lider")
        itens.append(
            {
                "id": x.id,
                "nome": x.name,
                "bairro": x.neighborhood,
                "lat": x.lat,
                "lon": x.lon,
                "aproximado": x.is_approximate,
                "status": status,
                "secoes_total": total_sec,
                "secoes_apuradas": apuradas,
                "lider": cand_curto(meta.get(lsq), lsq, 0, (r or {}).get("pct", 0)) if lsq else None,
                "margem_pp": (r or {}).get("margem", 0.0),
                "votos_validos": (r or {}).get("validos", 0),
            }
        )
    return {"total": total, "truncado": total > len(locs), "itens": itens}


def _status_local(apuradas: int, total: int) -> str:
    if not apuradas:
        return "nao_recebido"
    return "apurado" if apuradas >= total else "parcial"


async def item_local(session: AsyncSession, turno: int, cd: int, lid: str) -> dict | None:
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
        "nome": loc.name,
        "bairro": loc.neighborhood,
        "lat": loc.lat,
        "lon": loc.lon,
        "aproximado": loc.is_approximate,
        "status": _status_local(apuradas, total_sec),
        "secoes_total": total_sec,
        "secoes_apuradas": apuradas,
        "lider": cand_curto(meta.get(lsq), lsq, 0, r.leader_pct) if r and lsq else None,
        "margem_pp": r.margin_pp if r else 0.0,
        "votos_validos": r.valid_votes if r else 0,
    }


async def detalhe_local(session: AsyncSession, turno: int, lid: str) -> dict | None:
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
        "nome": loc.name,
        "endereco": loc.address,
        "bairro": loc.neighborhood,
        "cep": loc.zip_code,
        "lat": loc.lat,
        "lon": loc.lon,
        "aproximado": loc.is_approximate,
        "eleitores_aptos": loc.eligible_voters,
        "municipio": {"id": loc.municipality_id, "nome": mun.name if mun else loc.municipality_id},
        "zona": {"id": loc.electoral_zone_id, "numero": z.number if z else None},
        "secoes": [
            {
                "id": s.id,
                "numero": s.number,
                "eleitores_aptos": s.eligible_voters,
                "status": "apurado" if s.id in bols else "nao_recebido",
                "totalizado_em": iso(bols[s.id].tallied_at) if s.id in bols else None,
                "comparecimento": bols[s.id].turnout if s.id in bols else None,
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


async def detalhe_secao(session: AsyncSession, turno: int, sid: str) -> dict | None:
    r = parse(sid, "secao")
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
    mun = await session.get(Municipality, r.municipio_id)
    local_id = (sec.polling_place_id if sec else None) or (b.polling_place_id if b else None)
    loc = await session.get(PollingPlace, local_id) if local_id else None
    cargos = []
    if b:
        for cd, v in sorted((b.votes or {}).items(), key=lambda kv: int(kv[0])):
            cdi = int(cd)
            res = await session.execute(
                select(Candidate).where(
                    Candidate.round == turno,
                    Candidate.office_code == cdi,
                    Candidate.state_code == ("br" if cdi == 1 else r.uf),
                )
            )
            por_num = {c.ballot_number: c for c in res.scalars()}
            votos = []
            for num, q in sorted((v.get("nom") or {}).items(), key=lambda kv: -kv[1]):
                c = por_num.get(int(num))
                votos.append(
                    {
                        "tipo": "nominal",
                        "numero": int(num),
                        "sqcand": c.tse_candidate_id if c else None,
                        "nome_urna": c.ballot_name if c else f"Nº {num}",
                        "partido_sigla": c.party_abbreviation if c else "",
                        "cor": c.color if c else "#888",
                        "votos": q,
                    }
                )
            for num, q in sorted((v.get("leg") or {}).items(), key=lambda kv: -kv[1]):
                votos.append(
                    {
                        "tipo": "legenda",
                        "numero": int(num),
                        "sqcand": None,
                        "nome_urna": f"Legenda {num}",
                        "partido_sigla": "",
                        "cor": cores.cor_partido(int(num)),
                        "votos": q,
                    }
                )
            validos = sum(x["votos"] for x in votos)
            cargos.append(
                {
                    "cd": cdi,
                    "nome": NOMES_CARGO.get(cdi, str(cdi)),
                    "comparecimento": v.get("comp", 0),
                    "votos_validos": validos,
                    "brancos": v.get("b", 0),
                    "nulos": v.get("n", 0),
                    "votos": votos,
                }
            )
    return {
        "id": sid,
        "numero": r.secao,
        "uf": r.uf,
        "municipio": {"id": r.municipio_id, "nome": mun.name if mun else r.municipio_id},
        "zona": {"id": r.zona_id, "numero": r.zona},
        "local": {"id": local_id, "nome": loc.name if loc else None},
        "status": "apurado" if b else "nao_recebido",
        "totalizado_em": iso(b.tallied_at) if b else None,
        "emitido_em": iso(b.issued_at) if b else None,
        "hash": b.hash if b else None,
        "assinatura_ok": b.signature_valid if b else None,
        "url_bu": b.url if b else None,
        "eleitores_aptos": (sec.eligible_voters if sec else None) or (b.eligible_voters if b else None),
        "comparecimento": b.turnout if b else None,
        "cargos": cargos,
    }


# ------------------------------------------------------------------ candidatos


def candidato_json(c: Candidate) -> dict:
    return {
        "sqcand": c.tse_candidate_id,
        "numero": c.ballot_number,
        "nome": c.name,
        "nome_urna": c.ballot_name,
        "partido_sigla": c.party_abbreviation,
        "agremiacao": c.alliance,
        "cor": c.color,
        "foto_url": foto_url(c.tse_candidate_id),
        "uf": None if c.state_code == "br" else c.state_code,
        "cargo": c.office_code,
        "situacao_geral": c.overall_status,
        "eleito": c.elected,
        "vices": c.vice_and_substitutes,
    }


async def listar_candidatos(session: AsyncSession, turno: int, cd: int | None, uf: str | None) -> list[dict]:
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


async def detalhe_candidato(session: AsyncSession, sq: str, turno: int, t: datetime | None) -> dict | None:
    c = await session.get(Candidate, sq)
    if c is None:
        return None
    info = await cargo_info(session, c.round, c.office_code)
    r = Recorte("br", "br") if c.state_code == "br" else Recorte("uf", c.state_code, uf=c.state_code)
    res = await montar_resultado(session, c.round, c.office_code, r, t)
    meu = next((x for x in res.get("candidatos", []) if x["sqcand"] == sq), None)
    return {
        **candidato_json(c),
        "cargo": cargo_json(info[1] if info else None, c.office_code),
        "resultado": {
            "votos": meu["votos"],
            "pct_validos": meu["pct_validos"],
            "posicao": meu["posicao"],
            "situacao": meu["situacao"],
        }
        if meu
        else None,
    }


# ------------------------------------------------------------------ busca


def sem_acento(texto: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", texto) if unicodedata.category(ch) != "Mn"
    ).lower()


async def buscar(session: AsyncSession, q: str, limite: int = 20) -> dict:
    q = q.strip()
    if len(q) < 2:
        return {"itens": []}
    termo = f"%{sem_acento(q)}%"
    itens: list[dict] = []
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
        {"tipo": "uf", "nivel": "uf", "id": u.code, "titulo": u.name, "subtitulo": u.code.upper()}
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
            "tipo": "municipio",
            "nivel": "municipio",
            "id": m.id,
            "titulo": m.name,
            "subtitulo": f"{m.state_code.upper()}"
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
            "tipo": "candidato",
            "id": c.tse_candidate_id,
            "titulo": f"{c.ballot_name} ({c.ballot_number})",
            "subtitulo": f"{NOMES_CARGO.get(c.office_code, c.office_code)} · {c.party_abbreviation}"
            + (f" · {c.state_code.upper()}" if c.state_code != "br" else ""),
            "cargo": c.office_code,
            "uf": None if c.state_code == "br" else c.state_code,
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
            "tipo": "local",
            "nivel": "local",
            "id": loc.id,
            "titulo": loc.name,
            "subtitulo": f"{(loc.neighborhood or '').title()} · {mn}/{loc.state_code.upper()}",
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
            nivel = "zona" if cls is ElectoralZone else "secao"
            itens.append(
                {
                    "tipo": nivel,
                    "nivel": nivel,
                    "id": obj.id,
                    "titulo": f"{'Zona' if nivel == 'zona' else 'Seção'} {obj.number}",
                    "subtitulo": f"{mn}/{obj.state_code.upper()}",
                }
            )
    return {"itens": itens[: limite * 3]}


# ------------------------------------------------------------------ eventos, linha do tempo, status


def evento_json(e: Event) -> dict:
    return {
        "id": e.id,
        "tipo": e.type,
        "ocorrido_em": iso(e.occurred_at),
        "cargo": e.office_code,
        "nivel": e.level,
        "recorte_id": e.geo_area_id,
        "titulo": e.title,
        "descricao": e.description,
        "payload": e.payload,
    }


async def listar_eventos(session: AsyncSession, filtro: ConsultaEventos) -> list[dict]:
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
                Event.type == "inicio",
            )
        )
    rows = (
        (await session.execute(q.order_by(Event.occurred_at.desc(), Event.id.desc()).limit(filtro.limite)))
        .scalars()
        .all()
    )
    return [evento_json(e) for e in rows]


async def linha_do_tempo(session: AsyncSession, turno: int) -> dict:
    ini, fim = (
        await session.execute(
            select(func.min(ResultSnapshot.tallied_at), func.max(ResultSnapshot.tallied_at)).where(
                ResultSnapshot.round == turno, ResultSnapshot.level.in_(["br", "uf"])
            )
        )
    ).one()
    eventos = await listar_eventos(session, ConsultaEventos(turno=turno, limite=300))
    eventos = [e for e in eventos if e["nivel"] in ("br", "uf", None)]
    return {"inicio": iso(ini), "fim": iso(fim), "agora": iso(fim), "eventos": eventos}


async def ultima_totalizacao(session: AsyncSession) -> datetime | None:
    return (
        await session.execute(select(func.max(CurrentResult.tallied_at)).where(CurrentResult.level == "br"))
    ).scalar_one()


async def pct_br(session: AsyncSession, turno: int = 1) -> float:
    r = (
        await session.execute(
            select(CurrentProgress.pct_sections).where(
                CurrentProgress.round == turno, CurrentProgress.level == "br"
            )
        )
    ).scalar_one_or_none()
    return float(r or 0.0)
