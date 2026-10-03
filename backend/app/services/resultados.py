"""Consultas de leitura: montam os payloads do contrato da API (docs/11-contrato-api.md)."""

from __future__ import annotations

import unicodedata
from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    UF,
    Boletim,
    Candidato,
    Eleicao,
    EleicaoCargo,
    Evento,
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
from app.services.recortes import FILHO, Recorte, parse


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def pct(parte: float, todo: float) -> float:
    return round(parte * 100.0 / todo, 4) if todo else 0.0


def status_por_pct(p: float | None, totalizadas: int | None = None) -> str:
    if not p and not totalizadas:
        return "nao_recebido"
    return "apurado" if (p or 0) >= 99.9999 else "parcial"


# ------------------------------------------------------------------ cargos e eleições


async def cargo_info(session: AsyncSession, turno: int, cd_cargo: int) -> tuple[Eleicao, EleicaoCargo] | None:
    res = await session.execute(
        select(Eleicao, EleicaoCargo).join(EleicaoCargo, EleicaoCargo.eleicao_id == Eleicao.id)
        .where(Eleicao.turno == turno, EleicaoCargo.cd_cargo == cd_cargo).order_by(Eleicao.id.desc()).limit(1)
    )
    row = res.first()
    return (row[0], row[1]) if row else None


def cargo_json(c: EleicaoCargo | None, cd: int) -> dict:
    if c is None:
        return {"cd": cd, "nome": f"Cargo {cd}", "sistema": "majoritario", "vagas": 1}
    return {"cd": c.cd_cargo, "nome": c.nome, "sistema": c.sistema, "vagas": c.vagas}


async def listar_eleicoes(session: AsyncSession) -> list[dict]:
    eleicoes = (await session.execute(select(Eleicao).order_by(Eleicao.turno, Eleicao.id))).scalars().all()
    return [{
        "id": e.id, "turno": e.turno, "ciclo": e.ciclo, "tipo": e.tipo, "nome": e.nome, "cd_eleicao": e.cd_eleicao,
        "cargos": [{"cd": c.cd_cargo, "nome": c.nome, "sistema": c.sistema, "abrangencia": c.abrangencia, "vagas": c.vagas}
                   for c in e.cargos],
    } for e in eleicoes]


# ------------------------------------------------------------------ nomes e breadcrumb


async def nome_recorte(session: AsyncSession, r: Recorte) -> str:
    if r.nivel == "br":
        return "Brasil"
    if r.nivel == "uf":
        uf = await session.get(UF, r.uf)
        return uf.nome if uf else (r.uf or "").upper()
    if r.nivel == "municipio":
        m = await session.get(Municipio, r.id)
        return m.nome if m else r.id
    if r.nivel == "zona":
        return f"Zona {r.zona}"
    if r.nivel == "local":
        loc = await session.get(LocalVotacao, r.id)
        return loc.nome if loc else f"Local {r.local}"
    return f"Seção {r.secao}"


async def info_recorte(session: AsyncSession, r: Recorte) -> dict:
    cadeia: list[Recorte] = []
    atual: Recorte | None = r
    while atual is not None:
        cadeia.append(atual)
        atual = atual.pai
    cadeia.reverse()
    if r.nivel == "secao":
        sec = await session.get(Secao, r.id)
        if sec and sec.local_id:
            cadeia.insert(len(cadeia) - 1, parse(sec.local_id))
    bread = [{"nivel": x.nivel, "id": x.id, "nome": await nome_recorte(session, x)} for x in cadeia]
    return {"nivel": r.nivel, "id": r.id, "nome": bread[-1]["nome"], "uf": r.uf, "breadcrumb": bread}


# ------------------------------------------------------------------ linhas de resultado (TSE ou soma de BUs)


COLS_LEVES = [c for c in Snapshot.__table__.columns if c.key not in ("candidatos", "agremiacoes", "id")]


def _row_dict(row) -> dict:
    return dict(row._mapping)


async def linha_tse(session: AsyncSession, turno: int, cd: int, nivel: str, rid: str, t: datetime | None) -> dict | None:
    if t is None:
        obj = (await session.execute(select(ResultadoAtual).where(
            ResultadoAtual.turno == turno, ResultadoAtual.cd_cargo == cd, ResultadoAtual.nivel == nivel,
            ResultadoAtual.recorte_id == rid))).scalar_one_or_none()
    else:
        obj = (await session.execute(select(Snapshot).where(
            Snapshot.turno == turno, Snapshot.cd_cargo == cd, Snapshot.nivel == nivel, Snapshot.recorte_id == rid,
            Snapshot.totalizado_em <= t).order_by(Snapshot.totalizado_em.desc(), Snapshot.idg.desc()).limit(1)
        )).scalar_one_or_none()
    if obj is None:
        return None
    return {c.key: getattr(obj, c.key) for c in obj.__table__.columns}


async def numeros_para_sq(session: AsyncSession, turno: int, cd: int, uf: str) -> dict[int, str]:
    res = await session.execute(select(Candidato.numero, Candidato.sqcand).where(
        Candidato.turno == turno, Candidato.cd_cargo == cd, Candidato.uf == ("br" if cd == 1 else uf)))
    return {int(n): sq for n, sq in res.all()}


def soma_boletins(votos_por_bu: list[dict], aptos_total: int, secoes_total: int, mapa: dict[int, str]) -> dict:
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
    cands = sorted(({"sq": mapa.get(int(k), f"n{k}"), "v": q, "p": pct(q, validos), "e": False, "st": "", "d": "Válido",
                     "num": int(k)} for k, q in nom.items()), key=lambda c: -c["v"])
    apuradas = len([v for v in votos_por_bu if v])
    tv = validos + b + n
    lider = cands[0] if cands and cands[0]["v"] > 0 else None
    segundo = cands[1] if len(cands) > 1 else None
    return {
        "fonte": "soma_bu", "eleitorado": aptos_total, "eleitorado_apurado": 0, "secoes_total": max(secoes_total, apuradas),
        "secoes_totalizadas": apuradas, "pct_secoes": pct(apuradas, max(secoes_total, apuradas)),
        "comparecimento": comp, "pct_comparecimento": 0.0, "abstencao": 0, "pct_abstencao": 0.0,
        "votos_total": tv, "votos_validos": validos, "pct_validos": pct(validos, tv), "brancos": b,
        "pct_brancos": pct(b, tv), "nulos": n, "pct_nulos": pct(n, tv), "matematicamente_definido": False,
        "totalizacao_final": apuradas >= secoes_total > 0, "candidatos": cands, "agremiacoes": [],
        "lider_sqcand": lider["sq"] if lider else None, "lider_votos": lider["v"] if lider else 0,
        "lider_pct": lider["p"] if lider else 0.0, "segundo_sqcand": segundo["sq"] if segundo else None,
        "segundo_votos": segundo["v"] if segundo else 0, "segundo_pct": segundo["p"] if segundo else 0.0,
        "margem_pp": round((lider["p"] if lider else 0) - (segundo["p"] if segundo else 0), 4),
        "idg": 0, "totalizado_em": None, "capturado_em": None, "jws_verificado": False, "partido_lider": None,
    }


async def linha_bu(session: AsyncSession, turno: int, cd: int, r: Recorte, t: datetime | None) -> dict | None:
    """Resultado de zona/local/seção somando os boletins de urna coletados."""
    filtro = [Boletim.turno == turno]
    if r.nivel == "secao":
        filtro.append(Boletim.secao_id == r.id)
        secoes_total = 1
        sec = await session.get(Secao, r.id)
        aptos = sec.eleitores_aptos if sec and sec.eleitores_aptos else 0
    elif r.nivel == "local":
        filtro.append(Boletim.local_id == r.id)
        loc = await session.get(LocalVotacao, r.id)
        secoes_total = loc.qtd_secoes if loc else 0
        aptos = loc.eleitores_aptos if loc else 0
    else:
        filtro.append(Boletim.zona_id == r.id)
        secoes_total = (await session.execute(select(func.count()).select_from(Secao).where(Secao.zona_id == r.id))).scalar_one()
        aptos = (await session.execute(select(func.coalesce(func.sum(Secao.eleitores_aptos), 0)).where(Secao.zona_id == r.id))).scalar_one()
    if t is not None:
        filtro.append(Boletim.totalizado_em <= t)
    rows = (await session.execute(select(Boletim.votos[str(cd)], Boletim.totalizado_em, Boletim.capturado_em,
                                         Boletim.eleitores_aptos).where(*filtro))).all()
    if not rows and r.nivel == "secao":
        return None
    mapa = await numeros_para_sq(session, turno, cd, r.uf or "br")
    linha = soma_boletins([x[0] for x in rows], int(aptos or sum(x[3] or 0 for x in rows)), int(secoes_total), mapa)
    linha["eleitorado_apurado"] = sum(x[3] or 0 for x in rows)
    linha["abstencao"] = max(0, linha["eleitorado_apurado"] - linha["comparecimento"])
    linha["pct_comparecimento"] = pct(linha["comparecimento"], linha["eleitorado_apurado"])
    linha["pct_abstencao"] = pct(linha["abstencao"], linha["eleitorado_apurado"])
    linha["totalizado_em"] = max((x[1] for x in rows if x[1]), default=None)
    linha["capturado_em"] = max((x[2] for x in rows if x[2]), default=None)
    return linha


async def obter_linha(session: AsyncSession, turno: int, cd: int, r: Recorte, t: datetime | None) -> dict | None:
    if r.nivel in ("br", "uf", "municipio", "zona"):
        rid = r.id
        linha = await linha_tse(session, turno, cd, r.nivel, rid, t)
        if linha is not None or r.nivel != "zona":
            return linha
    if r.nivel in ("zona", "local", "secao"):
        return await linha_bu(session, turno, cd, r, t)
    return None


# ------------------------------------------------------------------ candidatos (metadados)


async def meta_candidatos(session: AsyncSession, sqs: list[str]) -> dict[str, Candidato]:
    sqs = [s for s in set(sqs) if s]
    if not sqs:
        return {}
    res = await session.execute(select(Candidato).where(Candidato.sqcand.in_(sqs)))
    return {c.sqcand: c for c in res.scalars()}


def cand_curto(c: Candidato | None, sq: str | None, votos: int = 0, p: float = 0.0) -> dict | None:
    if sq is None:
        return None
    return {"sqcand": sq, "nome_urna": c.nome_urna if c else sq, "cor": c.cor if c else "#888888",
            "numero": c.numero if c else None, "partido_sigla": c.partido_sigla if c else "", "votos": votos,
            "pct": round(p, 4)}


def foto_url(sq: str) -> str:
    return f"/api/v1/fotos/{sq}"


# ------------------------------------------------------------------ /resultados


async def montar_resultado(session: AsyncSession, turno: int, cd: int, r: Recorte, t: datetime | None = None) -> dict:
    info = await cargo_info(session, turno, cd)
    cargo_e = info[1] if info else None
    recorte = await info_recorte(session, r)
    base = {"recorte": recorte, "cargo": cargo_json(cargo_e, cd)}
    linha = await obter_linha(session, turno, cd, r, t)
    if linha is None or (linha.get("fonte") == "soma_bu" and linha["secoes_totalizadas"] == 0 and r.nivel != "zona"):
        if linha is None:
            return {"sem_dados": True, **base}
    sistema = cargo_e.sistema if cargo_e else "majoritario"
    vagas = (cargo_e.vagas or 1) if sistema == "majoritario" else 0
    abrangencia = (cd == 1 and r.nivel == "br") or (cd != 1 and r.nivel == "uf")
    cands = linha.get("candidatos") or []
    meta = await meta_candidatos(session, [c["sq"] for c in cands])
    sit = situacao.calcular(cands, vagas, bool(linha.get("totalizacao_final")), bool(linha.get("matematicamente_definido")),
                            abrangencia)
    candidatos = []
    for pos, c in enumerate(cands, start=1):
        m = meta.get(c["sq"])
        candidatos.append({
            "sqcand": c["sq"], "numero": m.numero if m else c.get("num"), "nome": m.nome if m else c["sq"],
            "nome_urna": m.nome_urna if m else str(c.get("num", c["sq"])), "partido_sigla": m.partido_sigla if m else "",
            "partido_numero": m.partido_numero if m else None, "agremiacao": m.agremiacao if m else "",
            "cor": m.cor if m else "#888888", "foto_url": foto_url(c["sq"]), "votos": int(c["v"]),
            "pct_validos": float(c.get("p") or 0), "posicao": pos, "situacao": sit.get(c["sq"], situacao.EM_APURACAO),
            "situacao_geral": m.situacao_geral if m else situacao.EM_APURACAO, "eleito": bool(m.eleito) if m else False,
            "destinacao": c.get("d") or "Válido", "vices": m.vices if m else [],
        })
    agrs = []
    if sistema == "proporcional":
        for a in linha.get("agremiacoes") or []:
            agrs.append({"nome": a["nome"], "partidos": a.get("partidos", []), "votos": a.get("v", 0), "vagas": a.get("vag"),
                         "cor": cores.cor_texto(a["nome"])})
    lider = linha.get("lider_sqcand")
    cobertura = None
    if linha.get("fonte") == "soma_bu":
        cobertura = {"secoes_total": linha["secoes_total"], "secoes_coletadas": linha["secoes_totalizadas"]}
    return {
        "sem_dados": False, **base, "fonte": linha.get("fonte", "tse"), "cobertura": cobertura,
        "idg": str(linha.get("idg") or ""), "totalizado_em": iso(linha.get("totalizado_em")),
        "capturado_em": iso(linha.get("capturado_em")), "jws_verificado": bool(linha.get("jws_verificado")),
        "totais": {k: linha.get(k, 0) for k in (
            "eleitorado", "eleitorado_apurado", "secoes_total", "secoes_totalizadas", "pct_secoes", "comparecimento",
            "pct_comparecimento", "abstencao", "pct_abstencao", "votos_total", "votos_validos", "pct_validos", "brancos",
            "pct_brancos", "nulos", "pct_nulos")},
        "matematicamente_definido": bool(linha.get("matematicamente_definido")),
        "totalizacao_final": bool(linha.get("totalizacao_final")),
        "lider": {"sqcand": lider, "margem_pp": linha.get("margem_pp", 0),
                  "margem_votos": int(linha.get("lider_votos", 0)) - int(linha.get("segundo_votos", 0))} if lider else None,
        "candidatos": candidatos,
        "agremiacoes": agrs,
    }


# ------------------------------------------------------------------ /resultados/serie


async def serie(session: AsyncSession, turno: int, cd: int, r: Recorte, de: datetime | None, ate: datetime | None,
                max_pontos: int = 300) -> dict:
    filtro = [Snapshot.turno == turno, Snapshot.cd_cargo == cd, Snapshot.nivel == r.nivel, Snapshot.recorte_id == r.id]
    if de:
        filtro.append(Snapshot.totalizado_em >= de)
    if ate:
        filtro.append(Snapshot.totalizado_em <= ate)
    rows = (await session.execute(select(Snapshot.totalizado_em, Snapshot.pct_secoes, Snapshot.votos_validos,
                                         Snapshot.candidatos).where(*filtro).order_by(Snapshot.totalizado_em, Snapshot.idg))).all()
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
        pontos.append({"t": iso(t), "pct_secoes": p, "votos_validos": vv,
                       "candidatos": {sq: {"votos": mapa[sq]["v"], "pct": mapa[sq]["p"]} for sq in top if sq in mapa}})
    candidatos = [{"sqcand": sq, "nome_urna": meta[sq].nome_urna if sq in meta else sq,
                   "cor": meta[sq].cor if sq in meta else "#888", "numero": meta[sq].numero if sq in meta else None,
                   "partido_sigla": meta[sq].partido_sigla if sq in meta else ""} for sq in top]
    eventos = await listar_eventos(session, turno, None, 200, None, cd, r.nivel, r.id)
    return {"candidatos": candidatos, "pontos": pontos, "eventos": eventos}


# ------------------------------------------------------------------ /recortes/filhos


async def _linhas_nivel(session: AsyncSession, turno: int, cd: int, nivel: str, pai: str | None, t: datetime | None,
                        com_candidatos: bool) -> dict[str, dict]:
    tabela = ResultadoAtual if t is None else Snapshot
    cols = [c for c in tabela.__table__.columns if c.key not in ("agremiacoes", "id")
            and (com_candidatos or c.key != "candidatos")]
    filtro = [tabela.turno == turno, tabela.cd_cargo == cd, tabela.nivel == nivel]
    if pai:
        filtro.append(tabela.pai_id == pai)
    if t is None:
        stmt = select(*cols).where(*filtro)
    else:
        filtro.append(tabela.totalizado_em <= t)
        stmt = (select(*cols).where(*filtro).order_by(tabela.recorte_id, tabela.totalizado_em.desc(), tabela.idg.desc())
                .distinct(tabela.recorte_id))
    return {row.recorte_id: _row_dict(row) for row in (await session.execute(stmt)).all()}


def montar_item(nivel_f: str, d: dict, ln: dict | None, meta: dict, candidatos: list[str] | None = None) -> dict:
    item = {"nivel": nivel_f, "id": d["id"], "nome": d["nome"], "uf": d.get("uf"), "cd_ibge": d.get("cd_ibge"),
            "regiao": d.get("regiao"), "capital": d.get("capital", False), "lat": d.get("lat"), "lon": d.get("lon"),
            "status": "nao_recebido", "pct_secoes": 0.0, "eleitorado": d.get("eleitorado") or 0, "comparecimento": 0,
            "pct_abstencao": 0.0, "votos_validos": 0, "brancos": 0, "nulos": 0, "lider": None, "segundo": None,
            "margem_pp": 0.0, "partido_lider": None, "valores": {}}
    if not ln:
        return item
    lsq, ssq = ln.get("lider_sqcand"), ln.get("segundo_sqcand")
    item.update({
        "status": status_por_pct(ln.get("pct_secoes"), ln.get("secoes_totalizadas")),
        "pct_secoes": ln.get("pct_secoes") or 0.0, "eleitorado": ln.get("eleitorado") or item["eleitorado"],
        "comparecimento": ln.get("comparecimento") or 0, "pct_abstencao": ln.get("pct_abstencao") or 0.0,
        "votos_validos": ln.get("votos_validos") or 0, "brancos": ln.get("brancos") or 0, "nulos": ln.get("nulos") or 0,
        "lider": cand_curto(meta.get(lsq), lsq, ln.get("lider_votos") or 0, ln.get("lider_pct") or 0) if lsq else None,
        "segundo": cand_curto(meta.get(ssq), ssq, ln.get("segundo_votos") or 0, ln.get("segundo_pct") or 0) if ssq else None,
        "margem_pp": ln.get("margem_pp") or 0.0,
    })
    if ln.get("partido_lider"):
        item["partido_lider"] = {"sigla": ln["partido_lider"], "cor": cores.cor_texto(ln["partido_lider"])}
    if candidatos and ln.get("candidatos") is not None:
        mapa = {c["sq"]: c.get("p", 0) for c in ln["candidatos"]}
        item["valores"] = {sq: mapa.get(sq, 0.0) for sq in candidatos}
    return item


async def filhos(session: AsyncSession, turno: int, cd: int, r: Recorte, t: datetime | None,
                 nivel_filhos: str | None = None, candidatos: list[str] | None = None) -> dict:
    nivel_f = nivel_filhos or FILHO.get(r.nivel)
    if nivel_f is None:
        return {"nivel_filhos": None, "candidatos": [], "itens": []}
    itens: list[dict] = []
    linhas: dict[str, dict] = {}
    dim: list[dict] = []
    regioes = {u.sigla: u.regiao for u in (await session.execute(select(UF))).scalars()}
    if nivel_f == "uf":
        ufs = (await session.execute(select(UF).order_by(UF.sigla))).scalars().all()
        linhas = await _linhas_nivel(session, turno, cd, "uf", None, t, bool(candidatos))
        dim = [{"id": u.sigla, "nome": u.nome, "uf": u.sigla, "regiao": u.regiao} for u in ufs
               if u.sigla != "zz" or u.sigla in linhas]
    elif nivel_f == "municipio":
        q = select(Municipio)
        if r.nivel == "uf":
            q = q.where(Municipio.uf == r.uf)
        muns = (await session.execute(q.order_by(Municipio.nome))).scalars().all()
        linhas = await _linhas_nivel(session, turno, cd, "municipio", r.uf if r.nivel == "uf" else None, t, bool(candidatos))
        dim = [{"id": m.id, "nome": m.nome, "uf": m.uf, "cd_ibge": m.cd_ibge, "capital": m.capital, "lat": m.lat,
                "lon": m.lon, "regiao": regioes.get(m.uf), "eleitorado": m.eleitorado} for m in muns]
    elif nivel_f == "zona":
        zonas = (await session.execute(select(Zona).where(Zona.municipio_id == r.id).order_by(Zona.numero))).scalars().all()
        linhas = await _linhas_nivel(session, turno, cd, "zona", r.id, t, bool(candidatos))
        for z in zonas:
            if z.id not in linhas:
                lb = await linha_bu(session, turno, cd, parse(z.id), t)
                if lb and lb["secoes_totalizadas"]:
                    linhas[z.id] = lb
        dim = [{"id": z.id, "nome": f"Zona {z.numero}", "uf": z.uf, "regiao": regioes.get(z.uf)} for z in zonas]
    elif nivel_f == "local":
        locs = (await session.execute(select(LocalVotacao).where(LocalVotacao.zona_id == r.id).order_by(LocalVotacao.numero))).scalars().all()
        for loc in locs:
            lb = await linha_bu(session, turno, cd, parse(loc.id), t)
            if lb and lb["secoes_totalizadas"]:
                linhas[loc.id] = lb
        dim = [{"id": loc.id, "nome": loc.nome, "uf": loc.uf, "lat": loc.lat, "lon": loc.lon, "regiao": regioes.get(loc.uf),
                "eleitorado": loc.eleitores_aptos} for loc in locs]
    elif nivel_f == "secao":
        secs = (await session.execute(select(Secao).where(Secao.local_id == r.id).order_by(Secao.numero))).scalars().all()
        for s in secs:
            lb = await linha_bu(session, turno, cd, parse(s.id), t)
            if lb:
                linhas[s.id] = lb
        dim = [{"id": s.id, "nome": f"Seção {s.numero}", "uf": s.uf, "regiao": regioes.get(s.uf),
                "eleitorado": s.eleitores_aptos} for s in secs]
    sqs: list[str] = []
    for ln in linhas.values():
        sqs += [ln.get("lider_sqcand"), ln.get("segundo_sqcand")]
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
        lista_cands.append({"sqcand": sq, "nome_urna": m.nome_urna if m else sq, "cor": m.cor if m else "#888",
                            "numero": m.numero if m else None, "partido_sigla": m.partido_sigla if m else "",
                            "vitorias": vitorias.get(sq, 0)})
    lista_cands.sort(key=lambda c: -c["vitorias"])
    return {"nivel_filhos": nivel_f, "candidatos": lista_cands, "itens": itens}


async def item_filho(session: AsyncSession, turno: int, cd: int, linha: dict) -> dict:
    """Item de /recortes/filhos para um único recorte (usado no tempo real)."""
    nivel = linha["nivel"]
    rid = linha["recorte_id"]
    d: dict = {"id": rid, "nome": rid, "uf": linha.get("uf")}
    if nivel == "uf":
        u = await session.get(UF, rid)
        d.update({"nome": u.nome if u else rid.upper(), "regiao": u.regiao if u else None})
    elif nivel == "municipio":
        m = await session.get(Municipio, rid)
        if m:
            u = await session.get(UF, m.uf)
            d.update({"nome": m.nome, "cd_ibge": m.cd_ibge, "capital": m.capital, "lat": m.lat, "lon": m.lon,
                      "regiao": u.regiao if u else None, "eleitorado": m.eleitorado})
    elif nivel == "zona":
        d["nome"] = f"Zona {int(rid[-4:])}"
    meta = await meta_candidatos(session, [x for x in (linha.get("lider_sqcand"), linha.get("segundo_sqcand")) if x])
    return montar_item(nivel, d, linha, meta)


# ------------------------------------------------------------------ /progresso


async def progresso(session: AsyncSession, turno: int, t: datetime | None) -> dict:
    if t is None:
        rows = (await session.execute(select(ProgressoAtual).where(ProgressoAtual.turno == turno,
                                                                   ProgressoAtual.nivel.in_(["br", "uf"])))).scalars().all()
    else:
        rows = (await session.execute(
            select(ProgressoSnapshot).where(ProgressoSnapshot.turno == turno, ProgressoSnapshot.nivel.in_(["br", "uf"]),
                                            ProgressoSnapshot.totalizado_em <= t)
            .order_by(ProgressoSnapshot.recorte_id, ProgressoSnapshot.totalizado_em.desc()).distinct(ProgressoSnapshot.recorte_id)
        )).scalars().all()
    nomes = {u.sigla: u.nome for u in (await session.execute(select(UF))).scalars()}
    total_mun = dict((await session.execute(select(Municipio.uf, func.count()).group_by(Municipio.uf))).all())
    br = next((x for x in rows if x.nivel == "br"), None)
    itens = [{
        "uf": x.recorte_id, "nome": nomes.get(x.recorte_id, x.recorte_id.upper()), "pct_secoes": x.pct_secoes,
        "secoes_total": x.secoes_total, "secoes_totalizadas": x.secoes_totalizadas,
        "municipios_total": total_mun.get(x.recorte_id, 0), "municipios_finalizados": x.municipios_finalizados,
        "municipios_parciais": x.municipios_parciais, "municipios_nao_recebidos": x.municipios_nao_recebidos,
        "pct_comparecimento": x.pct_comparecimento, "atualizado_em": iso(x.totalizado_em),
    } for x in sorted(rows, key=lambda x: x.recorte_id) if x.nivel == "uf"]
    return {"br": {"pct_secoes": br.pct_secoes if br else 0.0, "secoes_total": br.secoes_total if br else 0,
                   "secoes_totalizadas": br.secoes_totalizadas if br else 0, "atualizado_em": iso(br.totalizado_em) if br else None},
            "itens": itens}


# ------------------------------------------------------------------ locais de votação


async def locais_mapa(session: AsyncSession, turno: int, cd: int, uf: str | None, municipio: str | None,
                      bbox: tuple[float, float, float, float] | None, t: datetime | None, limite: int = 20000) -> dict:
    filtro = []
    if uf:
        filtro.append(LocalVotacao.uf == uf)
    if municipio:
        filtro.append(LocalVotacao.municipio_id == municipio)
    if bbox:
        filtro += [LocalVotacao.lon >= bbox[0], LocalVotacao.lat >= bbox[1], LocalVotacao.lon <= bbox[2],
                   LocalVotacao.lat <= bbox[3]]
    total = (await session.execute(select(func.count()).select_from(LocalVotacao).where(*filtro))).scalar_one()
    locs = (await session.execute(select(LocalVotacao.id, LocalVotacao.nome, LocalVotacao.bairro, LocalVotacao.lat,
                                         LocalVotacao.lon, LocalVotacao.aproximado, LocalVotacao.qtd_secoes, LocalVotacao.uf)
                                  .where(*filtro).limit(limite))).all()
    ids = [x.id for x in locs]
    res: dict[str, dict] = {}
    if t is None:
        for i in range(0, len(ids), 5000):
            rows = (await session.execute(select(ResultadoLocal).where(
                ResultadoLocal.turno == turno, ResultadoLocal.cd_cargo == cd, ResultadoLocal.local_id.in_(ids[i:i + 5000])))).scalars()
            for x in rows:
                res[x.local_id] = {"secoes_apuradas": x.secoes_apuradas, "secoes_total": x.secoes_total,
                                   "lider": x.lider_sqcand, "pct": x.lider_pct, "margem": x.margem_pp, "validos": x.votos_validos}
    else:
        mapas: dict[str, dict[int, str]] = {}
        for i in range(0, len(ids), 5000):
            rows = (await session.execute(select(Boletim.local_id, Boletim.uf, Boletim.votos[str(cd)]).where(
                Boletim.turno == turno, Boletim.local_id.in_(ids[i:i + 5000]), Boletim.totalizado_em <= t))).all()
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
                res[lid] = {"secoes_apuradas": s["secoes_totalizadas"], "secoes_total": 0, "lider": s["lider_sqcand"],
                            "pct": s["lider_pct"], "margem": s["margem_pp"], "validos": s["votos_validos"]}
    meta = await meta_candidatos(session, [v["lider"] for v in res.values() if v.get("lider")])
    itens = []
    for x in locs:
        r = res.get(x.id)
        total_sec = max(x.qtd_secoes or 0, (r or {}).get("secoes_total") or 0, (r or {}).get("secoes_apuradas") or 0)
        apuradas = (r or {}).get("secoes_apuradas", 0)
        status = "nao_recebido" if not apuradas else ("apurado" if apuradas >= total_sec else "parcial")
        lsq = (r or {}).get("lider")
        itens.append({
            "id": x.id, "nome": x.nome, "bairro": x.bairro, "lat": x.lat, "lon": x.lon, "aproximado": x.aproximado,
            "status": status, "secoes_total": total_sec, "secoes_apuradas": apuradas,
            "lider": cand_curto(meta.get(lsq), lsq, 0, (r or {}).get("pct", 0)) if lsq else None,
            "margem_pp": (r or {}).get("margem", 0.0), "votos_validos": (r or {}).get("validos", 0),
        })
    return {"total": total, "truncado": total > len(locs), "itens": itens}


async def item_local(session: AsyncSession, turno: int, cd: int, lid: str) -> dict | None:
    loc = await session.get(LocalVotacao, lid)
    if loc is None:
        return None
    r = (await session.execute(select(ResultadoLocal).where(ResultadoLocal.turno == turno, ResultadoLocal.cd_cargo == cd,
                                                            ResultadoLocal.local_id == lid))).scalar_one_or_none()
    meta = await meta_candidatos(session, [r.lider_sqcand] if r and r.lider_sqcand else [])
    apuradas = r.secoes_apuradas if r else 0
    total_sec = max(loc.qtd_secoes or 0, r.secoes_total if r else 0)
    return {
        "id": loc.id, "nome": loc.nome, "bairro": loc.bairro, "lat": loc.lat, "lon": loc.lon, "aproximado": loc.aproximado,
        "status": "nao_recebido" if not apuradas else ("apurado" if apuradas >= total_sec else "parcial"),
        "secoes_total": total_sec, "secoes_apuradas": apuradas,
        "lider": cand_curto(meta.get(r.lider_sqcand), r.lider_sqcand, 0, r.lider_pct) if r and r.lider_sqcand else None,
        "margem_pp": r.margem_pp if r else 0.0, "votos_validos": r.votos_validos if r else 0,
    }


async def detalhe_local(session: AsyncSession, turno: int, lid: str) -> dict | None:
    loc = await session.get(LocalVotacao, lid)
    if loc is None:
        return None
    mun = await session.get(Municipio, loc.municipio_id)
    z = await session.get(Zona, loc.zona_id)
    secs = (await session.execute(select(Secao).where(Secao.local_id == lid).order_by(Secao.numero))).scalars().all()
    bols = {b.secao_id: b for b in (await session.execute(select(Boletim).where(Boletim.turno == turno,
                                                                                 Boletim.local_id == lid))).scalars()}
    return {
        "id": loc.id, "nome": loc.nome, "endereco": loc.endereco, "bairro": loc.bairro, "cep": loc.cep, "lat": loc.lat,
        "lon": loc.lon, "aproximado": loc.aproximado, "eleitores_aptos": loc.eleitores_aptos,
        "municipio": {"id": loc.municipio_id, "nome": mun.nome if mun else loc.municipio_id},
        "zona": {"id": loc.zona_id, "numero": z.numero if z else None},
        "secoes": [{"id": s.id, "numero": s.numero, "eleitores_aptos": s.eleitores_aptos,
                    "status": "apurado" if s.id in bols else "nao_recebido",
                    "totalizado_em": iso(bols[s.id].totalizado_em) if s.id in bols else None,
                    "comparecimento": bols[s.id].comparecimento if s.id in bols else None} for s in secs],
    }


NOMES_CARGO = {1: "Presidente", 3: "Governador", 5: "Senador", 6: "Deputado Federal", 7: "Deputado Estadual",
               8: "Deputado Distrital"}


async def detalhe_secao(session: AsyncSession, turno: int, sid: str) -> dict | None:
    r = parse(sid, "secao")
    sec = await session.get(Secao, sid)
    b = (await session.execute(select(Boletim).where(Boletim.turno == turno, Boletim.secao_id == sid))).scalar_one_or_none()
    if sec is None and b is None:
        return None
    mun = await session.get(Municipio, r.municipio_id)
    local_id = (sec.local_id if sec else None) or (b.local_id if b else None)
    loc = await session.get(LocalVotacao, local_id) if local_id else None
    cargos = []
    if b:
        for cd, v in sorted((b.votos or {}).items(), key=lambda kv: int(kv[0])):
            cdi = int(cd)
            res = await session.execute(select(Candidato).where(Candidato.turno == turno, Candidato.cd_cargo == cdi,
                                                                Candidato.uf == ("br" if cdi == 1 else r.uf)))
            por_num = {c.numero: c for c in res.scalars()}
            votos = []
            for num, q in sorted((v.get("nom") or {}).items(), key=lambda kv: -kv[1]):
                c = por_num.get(int(num))
                votos.append({"tipo": "nominal", "numero": int(num), "sqcand": c.sqcand if c else None,
                              "nome_urna": c.nome_urna if c else f"Nº {num}", "partido_sigla": c.partido_sigla if c else "",
                              "cor": c.cor if c else "#888", "votos": q})
            for num, q in sorted((v.get("leg") or {}).items(), key=lambda kv: -kv[1]):
                votos.append({"tipo": "legenda", "numero": int(num), "sqcand": None, "nome_urna": f"Legenda {num}",
                              "partido_sigla": "", "cor": cores.cor_partido(int(num)), "votos": q})
            validos = sum(x["votos"] for x in votos)
            cargos.append({"cd": cdi, "nome": NOMES_CARGO.get(cdi, str(cdi)), "comparecimento": v.get("comp", 0),
                           "votos_validos": validos, "brancos": v.get("b", 0), "nulos": v.get("n", 0), "votos": votos})
    return {
        "id": sid, "numero": r.secao, "uf": r.uf, "municipio": {"id": r.municipio_id, "nome": mun.nome if mun else r.municipio_id},
        "zona": {"id": r.zona_id, "numero": r.zona}, "local": {"id": local_id, "nome": loc.nome if loc else None},
        "status": "apurado" if b else "nao_recebido", "totalizado_em": iso(b.totalizado_em) if b else None,
        "emitido_em": iso(b.emitido_em) if b else None, "hash": b.hash if b else None,
        "assinatura_ok": b.assinatura_ok if b else None, "url_bu": b.url if b else None,
        "eleitores_aptos": (sec.eleitores_aptos if sec else None) or (b.eleitores_aptos if b else None),
        "comparecimento": b.comparecimento if b else None, "cargos": cargos,
    }


# ------------------------------------------------------------------ candidatos


def candidato_json(c: Candidato) -> dict:
    return {"sqcand": c.sqcand, "numero": c.numero, "nome": c.nome, "nome_urna": c.nome_urna,
            "partido_sigla": c.partido_sigla, "agremiacao": c.agremiacao, "cor": c.cor, "foto_url": foto_url(c.sqcand),
            "uf": None if c.uf == "br" else c.uf, "cargo": c.cd_cargo, "situacao_geral": c.situacao_geral,
            "eleito": c.eleito, "vices": c.vices}


async def listar_candidatos(session: AsyncSession, turno: int, cd: int | None, uf: str | None) -> list[dict]:
    q = select(Candidato).where(Candidato.turno == turno)
    if cd:
        q = q.where(Candidato.cd_cargo == cd)
    if uf:
        q = q.where(Candidato.uf == uf)
    return [candidato_json(c) for c in (await session.execute(q.order_by(Candidato.cd_cargo, Candidato.uf,
                                                                          Candidato.numero))).scalars()]


async def detalhe_candidato(session: AsyncSession, sq: str, turno: int, t: datetime | None) -> dict | None:
    c = await session.get(Candidato, sq)
    if c is None:
        return None
    info = await cargo_info(session, c.turno, c.cd_cargo)
    r = Recorte("br", "br") if c.uf == "br" else Recorte("uf", c.uf, uf=c.uf)
    res = await montar_resultado(session, c.turno, c.cd_cargo, r, t)
    meu = next((x for x in res.get("candidatos", []) if x["sqcand"] == sq), None)
    return {**candidato_json(c), "cargo": cargo_json(info[1] if info else None, c.cd_cargo),
            "resultado": {"votos": meu["votos"], "pct_validos": meu["pct_validos"], "posicao": meu["posicao"],
                          "situacao": meu["situacao"]} if meu else None}


# ------------------------------------------------------------------ busca


def sem_acento(texto: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", texto) if unicodedata.category(ch) != "Mn").lower()


async def buscar(session: AsyncSession, q: str, limite: int = 20) -> dict:
    q = q.strip()
    if len(q) < 2:
        return {"itens": []}
    termo = f"%{sem_acento(q)}%"
    itens: list[dict] = []
    ufs = (await session.execute(select(UF).where(or_(func.unaccent(func.lower(UF.nome)).ilike(termo),
                                                       UF.sigla == q.lower()[:2] if len(q) == 2 else False)))).scalars().all()
    itens += [{"tipo": "uf", "nivel": "uf", "id": u.sigla, "titulo": u.nome, "subtitulo": u.sigla.upper()} for u in ufs]
    muns = (await session.execute(select(Municipio).where(func.unaccent(func.lower(Municipio.nome)).ilike(termo))
                                  .order_by(Municipio.capital.desc(), func.coalesce(Municipio.eleitorado, 0).desc(),
                                            Municipio.nome).limit(limite))).scalars().all()
    itens += [{"tipo": "municipio", "nivel": "municipio", "id": m.id, "titulo": m.nome,
               "subtitulo": f"{m.uf.upper()}" + (f" · {m.eleitorado:,} eleitores".replace(",", ".") if m.eleitorado else "")}
              for m in muns]
    numero = "".join(ch for ch in q if ch.isdigit())
    cand_filtro = [func.unaccent(func.lower(Candidato.nome_urna)).ilike(termo), func.unaccent(func.lower(Candidato.nome)).ilike(termo)]
    if numero and len(numero) == len(q.replace(" ", "")):
        cand_filtro.append(Candidato.numero == int(numero))
    cands = (await session.execute(select(Candidato).where(or_(*cand_filtro)).order_by(Candidato.cd_cargo).limit(limite))).scalars().all()
    itens += [{"tipo": "candidato", "id": c.sqcand, "titulo": f"{c.nome_urna} ({c.numero})",
               "subtitulo": f"{NOMES_CARGO.get(c.cd_cargo, c.cd_cargo)} · {c.partido_sigla}" + (f" · {c.uf.upper()}" if c.uf != "br" else ""),
               "cargo": c.cd_cargo, "uf": None if c.uf == "br" else c.uf} for c in cands]
    locs = (await session.execute(
        select(LocalVotacao, Municipio.nome).join(Municipio, Municipio.id == LocalVotacao.municipio_id)
        .where(or_(func.unaccent(func.lower(LocalVotacao.nome)).ilike(termo),
                   func.unaccent(func.lower(LocalVotacao.bairro)).ilike(termo),
                   func.unaccent(func.lower(LocalVotacao.endereco)).ilike(termo))).limit(limite))).all()
    itens += [{"tipo": "local", "nivel": "local", "id": loc.id, "titulo": loc.nome,
               "subtitulo": f"{(loc.bairro or '').title()} · {mn}/{loc.uf.upper()}"} for loc, mn in locs]
    palavras = sem_acento(q).split()
    if numero and palavras and palavras[0] in ("zona", "z", "secao", "seção", "s"):
        cls = Zona if palavras[0].startswith("z") else Secao
        resto = " ".join(p for p in palavras[1:] if not p.isdigit())
        stmt = select(cls, Municipio.nome).join(Municipio, Municipio.id == cls.municipio_id).where(cls.numero == int(numero))
        if resto:
            stmt = stmt.where(func.unaccent(func.lower(Municipio.nome)).ilike(f"%{resto}%"))
        for obj, mn in (await session.execute(stmt.limit(limite))).all():
            nivel = "zona" if cls is Zona else "secao"
            itens.append({"tipo": nivel, "nivel": nivel, "id": obj.id, "titulo": f"{'Zona' if nivel == 'zona' else 'Seção'} {obj.numero}",
                          "subtitulo": f"{mn}/{obj.uf.upper()}"})
    return {"itens": itens[: limite * 3]}


# ------------------------------------------------------------------ eventos, linha do tempo, status


def evento_json(e: Evento) -> dict:
    return {"id": e.id, "tipo": e.tipo, "ocorrido_em": iso(e.ocorrido_em), "cargo": e.cd_cargo, "nivel": e.nivel,
            "recorte_id": e.recorte_id, "titulo": e.titulo, "descricao": e.descricao, "payload": e.payload}


async def listar_eventos(session: AsyncSession, turno: int, desde: datetime | None, limite: int, tipos: list[str] | None,
                         cd: int | None = None, nivel: str | None = None, rid: str | None = None,
                         ate: datetime | None = None) -> list[dict]:
    q = select(Evento).where(Evento.turno == turno)
    if desde:
        q = q.where(Evento.ocorrido_em > desde)
    if ate:
        q = q.where(Evento.ocorrido_em <= ate)
    if tipos:
        q = q.where(Evento.tipo.in_(tipos))
    if cd:
        q = q.where(or_(Evento.cd_cargo == cd, Evento.cd_cargo.is_(None)))
    if nivel and rid:
        q = q.where(or_(and_(Evento.nivel == nivel, Evento.recorte_id == rid), Evento.tipo == "inicio"))
    rows = (await session.execute(q.order_by(Evento.ocorrido_em.desc(), Evento.id.desc()).limit(limite))).scalars().all()
    return [evento_json(e) for e in rows]


async def linha_do_tempo(session: AsyncSession, turno: int) -> dict:
    ini, fim = (await session.execute(select(func.min(Snapshot.totalizado_em), func.max(Snapshot.totalizado_em))
                                      .where(Snapshot.turno == turno, Snapshot.nivel.in_(["br", "uf"])))).one()
    eventos = await listar_eventos(session, turno, None, 300, None)
    eventos = [e for e in eventos if e["nivel"] in ("br", "uf", None)]
    return {"inicio": iso(ini), "fim": iso(fim), "agora": iso(fim), "eventos": eventos}


async def ultima_totalizacao(session: AsyncSession) -> datetime | None:
    return (await session.execute(select(func.max(ResultadoAtual.totalizado_em)).where(ResultadoAtual.nivel == "br"))).scalar_one()


async def pct_br(session: AsyncSession, turno: int = 1) -> float:
    r = (await session.execute(select(ProgressoAtual.pct_secoes).where(ProgressoAtual.turno == turno,
                                                                        ProgressoAtual.nivel == "br"))).scalar_one_or_none()
    return float(r or 0.0)


