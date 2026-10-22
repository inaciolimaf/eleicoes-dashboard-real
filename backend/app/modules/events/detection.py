"""Detecção de eventos da apuração (lead_change, milestone, elected, runoff) por comparação de estados."""

from __future__ import annotations

from datetime import datetime

from app.modules.elections import status as situacao

MARCOS = (10, 25, 50, 75, 90, 100)
NOMES_CARGO = {
    1: "Presidente",
    3: "Governador",
    5: "Senador",
    6: "Dep. Federal",
    7: "Dep. Estadual",
    8: "Dep. Distrital",
}


def _fmt(p: float) -> str:
    return f"{p:.2f}".replace(".", ",") + "%"


def detectar(
    anterior: dict | None,
    novo: dict,
    nomes: dict[str, str],
    recorte_nome: str,
    sistema: str,
    situacoes_antes: dict[str, str] | None = None,
    situacoes_depois: dict[str, str] | None = None,
) -> list[dict]:
    """Eventos para um recorte country/state de um cargo. `nomes`: tse_candidate_id -> nome de urna."""
    eventos: list[dict] = []
    nivel, cd = novo["level"], novo["office_code"]
    if nivel not in ("country", "state"):
        return eventos
    quando: datetime = novo["tallied_at"]
    base = {
        "office_code": cd,
        "level": nivel,
        "geo_area_id": novo["geo_area_id"],
        "occurred_at": quando,
        "round": novo["round"],
    }
    pct_antes = (anterior or {}).get("pct_sections") or 0.0
    pct_depois = novo.get("pct_sections") or 0.0
    cargo_nome = NOMES_CARGO.get(cd, str(cd))

    if cd == 1 and nivel == "country" and pct_antes <= 0 < pct_depois:
        eventos.append(
            {
                **base,
                "type": "start",
                "title": "Começou a divulgação dos resultados",
                "description": f"Primeiras seções totalizadas ({_fmt(pct_depois)}).",
                "payload": {},
            }
        )
    # marcos de apuração: só para o cargo de referência (o progresso é o mesmo para todos os cargos)
    referencia = cd == 1 or (nivel == "state" and cd == 3)
    if referencia and not (cd == 3 and nivel == "country"):
        for m in MARCOS:
            if pct_antes < m <= pct_depois + 1e-9:
                titulo = (
                    f"Apuração finalizada em {recorte_nome}"
                    if m == 100
                    else f"{recorte_nome}: {m}% das seções apuradas"
                )
                eventos.append(
                    {
                        **base,
                        "type": "milestone",
                        "title": titulo,
                        "description": f"{_fmt(pct_depois)} das seções totalizadas.",
                        "payload": {"milestone": m},
                    }
                )
    # virada de liderança (só majoritários; ignora ruído do comecinho)
    if sistema == "majoritario" and anterior and pct_depois >= 1.0:
        l_antes, l_depois = anterior.get("leader_candidate_id"), novo.get("leader_candidate_id")
        if l_antes and l_depois and l_antes != l_depois:
            eventos.append(
                {
                    **base,
                    "type": "lead_change",
                    "title": f"Virada em {recorte_nome} ({cargo_nome})",
                    "description": f"{nomes.get(l_depois, l_depois)} passou {nomes.get(l_antes, l_antes)} "
                    f"({_fmt(novo.get('leader_pct') or 0)} × {_fmt(novo.get('second_pct') or 0)}) "
                    f"com {_fmt(pct_depois)} apurado.",
                    "payload": {"new_leader": l_depois, "previous_leader": l_antes},
                }
            )
    # situação (eleito / 2º turno / matematicamente definido)
    if situacoes_depois:
        antes = situacoes_antes or {}
        for sq, st in situacoes_depois.items():
            if antes.get(sq) == st:
                continue
            nome = nomes.get(sq, sq)
            if st in (situacao.ELECTED, situacao.MATHEMATICALLY_ELECTED) and antes.get(sq) not in (
                situacao.ELECTED,
                situacao.MATHEMATICALLY_ELECTED,
            ):
                tipo = "elected" if st == situacao.ELECTED else "mathematically_decided"
                eventos.append(
                    {
                        **base,
                        "type": tipo,
                        "title": f"{nome} eleito(a) — {cargo_nome} {recorte_nome}",
                        "description": (
                            "Matematicamente eleito(a) antes do fim da apuração."
                            if tipo != "elected"
                            else f"Eleição definida com {_fmt(pct_depois)} apurado."
                        ),
                        "payload": {"tse_candidate_id": sq},
                    }
                )
            elif st == situacao.RUNOFF and sistema == "majoritario":
                eventos.append(
                    {
                        **base,
                        "type": "runoff",
                        "title": f"{nome} vai ao 2º turno — {cargo_nome} {recorte_nome}",
                        "description": "Nenhum candidato atingiu a maioria absoluta dos votos válidos.",
                        "payload": {"tse_candidate_id": sq},
                    }
                )
    return eventos
