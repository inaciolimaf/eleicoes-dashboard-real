"""Detecção de eventos da apuração (virada, marcos, eleito, 2º turno) comparando estado anterior e novo."""

from __future__ import annotations

from datetime import datetime

from app.services import situacao

MARCOS = (10, 25, 50, 75, 90, 100)
NOMES_CARGO = {1: "Presidente", 3: "Governador", 5: "Senador", 6: "Dep. Federal", 7: "Dep. Estadual", 8: "Dep. Distrital"}


def _fmt(p: float) -> str:
    return f"{p:.2f}".replace(".", ",") + "%"


def detectar(anterior: dict | None, novo: dict, nomes: dict[str, str], recorte_nome: str, sistema: str,
             situacoes_antes: dict[str, str] | None = None, situacoes_depois: dict[str, str] | None = None) -> list[dict]:
    """Eventos para um recorte BR/UF de um cargo. `nomes`: sqcand -> nome de urna."""
    eventos: list[dict] = []
    nivel, cd = novo["nivel"], novo["cd_cargo"]
    if nivel not in ("br", "uf"):
        return eventos
    quando: datetime = novo["totalizado_em"]
    base = {"cd_cargo": cd, "nivel": nivel, "recorte_id": novo["recorte_id"], "ocorrido_em": quando, "turno": novo["turno"]}
    pct_antes = (anterior or {}).get("pct_secoes") or 0.0
    pct_depois = novo.get("pct_secoes") or 0.0
    cargo_nome = NOMES_CARGO.get(cd, str(cd))

    if cd == 1 and nivel == "br" and pct_antes <= 0 < pct_depois:
        eventos.append({**base, "tipo": "inicio", "titulo": "Começou a divulgação dos resultados",
                        "descricao": f"Primeiras seções totalizadas ({_fmt(pct_depois)}).", "payload": {}})
    # marcos de apuração: só para o cargo de referência (o progresso é o mesmo para todos os cargos)
    referencia = cd == 1 or (nivel == "uf" and cd == 3)
    if referencia and not (cd == 3 and nivel == "br"):
        for m in MARCOS:
            if pct_antes < m <= pct_depois + 1e-9:
                titulo = (f"Apuração finalizada em {recorte_nome}" if m == 100
                          else f"{recorte_nome}: {m}% das seções apuradas")
                eventos.append({**base, "tipo": "marco", "titulo": titulo,
                                "descricao": f"{_fmt(pct_depois)} das seções totalizadas.", "payload": {"marco": m}})
    # virada de liderança (só majoritários; ignora ruído do comecinho)
    if sistema == "majoritario" and anterior and pct_depois >= 1.0:
        l_antes, l_depois = anterior.get("lider_sqcand"), novo.get("lider_sqcand")
        if l_antes and l_depois and l_antes != l_depois:
            eventos.append({**base, "tipo": "virada", "titulo": f"Virada em {recorte_nome} ({cargo_nome})",
                            "descricao": f"{nomes.get(l_depois, l_depois)} passou {nomes.get(l_antes, l_antes)} "
                                         f"({_fmt(novo.get('lider_pct') or 0)} × {_fmt(novo.get('segundo_pct') or 0)}) "
                                         f"com {_fmt(pct_depois)} apurado.",
                            "payload": {"novo_lider": l_depois, "lider_anterior": l_antes}})
    # situação (eleito / 2º turno / matematicamente definido)
    if situacoes_depois:
        antes = situacoes_antes or {}
        for sq, st in situacoes_depois.items():
            if antes.get(sq) == st:
                continue
            nome = nomes.get(sq, sq)
            if st in (situacao.ELEITO, situacao.MATEMATICAMENTE_ELEITO) and antes.get(sq) not in (
                    situacao.ELEITO, situacao.MATEMATICAMENTE_ELEITO):
                tipo = "eleito" if st == situacao.ELEITO else "matematicamente_definido"
                eventos.append({**base, "tipo": tipo, "titulo": f"{nome} eleito(a) — {cargo_nome} {recorte_nome}",
                                "descricao": ("Matematicamente eleito(a) antes do fim da apuração." if tipo != "eleito"
                                              else f"Eleição definida com {_fmt(pct_depois)} apurado."),
                                "payload": {"sqcand": sq}})
            elif st == situacao.SEGUNDO_TURNO and sistema == "majoritario":
                eventos.append({**base, "tipo": "segundo_turno", "titulo": f"{nome} vai ao 2º turno — {cargo_nome} {recorte_nome}",
                                "descricao": "Nenhum candidato atingiu a maioria absoluta dos votos válidos.",
                                "payload": {"sqcand": sq}})
    return eventos
