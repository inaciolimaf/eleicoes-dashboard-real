"""Regras de domínio: recortes, situação do candidato, eventos e cores."""

from datetime import UTC, datetime

import pytest

from app.modules.elections import colors as cores
from app.modules.elections import status as situacao
from app.modules.events import detection as eventos
from app.modules.geography import CHILD_LEVEL, GeoAreaInvalid, parse


@pytest.mark.parametrize(
    ("rid", "nivel"),
    [
        ("br", "country"),
        ("sp", "state"),
        ("sp71072", "municipality"),
        ("sp71072-z0001", "zone"),
        ("sp71072-z0001-l1015", "polling_place"),
        ("sp71072-z0001-s0120", "section"),
    ],
)
def test_recortes(rid, nivel):
    r = parse(rid)
    assert r.level == nivel and r.id == rid
    if nivel != "country":
        assert r.parent is not None


def test_recorte_detalhes_e_invalidos():
    r = parse("SP71072-Z0001-S0120")
    assert (r.uf, r.municipality, r.zone, r.section) == ("sp", 71072, 1, 120)
    assert r.parent.id == "sp71072-z0001" and r.parent.parent.id == "sp71072"
    assert r.parent.parent.parent.id == "sp"
    assert CHILD_LEVEL["zone"] == "polling_place"
    for ruim in ("", "s", "sp7107", "sp71072-x0001", "123"):
        with pytest.raises(GeoAreaInvalid):
            parse(ruim)
    with pytest.raises(GeoAreaInvalid):
        parse("sp", "municipality")


@pytest.mark.parametrize(
    ("e", "st", "dvt", "final", "esperado"),
    [
        (True, "Eleito", "Válido", True, situacao.ELECTED),
        (True, "Eleito", "Válido", False, situacao.MATHEMATICALLY_ELECTED),
        (False, "Eleito por QP", "Válido", True, situacao.ELECTED),
        (False, "Eleito por média", "Válido", True, situacao.ELECTED),
        (False, "2º turno", "Válido", True, situacao.RUNOFF),
        (False, "Suplente", "Válido", True, situacao.SUBSTITUTE),
        (False, "Não eleito", "Válido", True, situacao.NOT_ELECTED),
        (False, "", "Anulado sub judice", False, situacao.SUB_JUDICE),
        (False, "", "Válido", False, None),
    ],
)
def test_situacao_vem_do_tse(e, st, dvt, final, esperado):
    assert situacao.da_tse(e, st, dvt, final, False) == esperado


def test_liderando_e_calculado_so_quando_tse_nao_definiu():
    cands = [{"sq": "a", "v": 100}, {"sq": "b", "v": 90}, {"sq": "c", "v": 0}]
    assert situacao.calcular(cands, 1, False, False, True) == {
        "a": "LEADING",
        "b": "COUNTING",
        "c": "COUNTING",
    }
    # senado 2026: duas vagas
    assert situacao.calcular(cands, 2, False, False, True)["b"] == "LEADING"
    # proporcional: ninguém "liderando"
    assert set(situacao.calcular(cands, 0, False, False, True).values()) == {"COUNTING"}
    # abaixo da abrangência do cargo, a situação local ignora o "eleito" do TSE
    cands[0].update(e=True, st="Eleito")
    assert situacao.calcular(cands, 1, True, False, False)["a"] == "LEADING"
    assert situacao.calcular(cands, 1, True, False, True)["a"] == "ELECTED"


def _linha(pct, lider, segundo="x", nivel="country", cd=1):
    return {
        "level": nivel,
        "office_code": cd,
        "geo_area_id": "br" if nivel == "country" else "mg",
        "round": 1,
        "tallied_at": datetime(2026, 10, 4, 22, tzinfo=UTC),
        "pct_sections": pct,
        "leader_candidate_id": lider,
        "second_candidate_id": segundo,
        "leader_pct": 49.0,
        "second_pct": 48.0,
    }


def test_eventos_inicio_marcos_e_virada():
    nomes = {"a": "ANA", "b": "BIA"}
    evs = eventos.detectar(_linha(0, None), _linha(26, "a"), nomes, "Brasil", "majoritario")
    tipos = [e["type"] for e in evs]
    assert tipos.count("milestone") == 2 and "start" in tipos
    evs = eventos.detectar(_linha(60, "a", "b"), _linha(61, "b", "a"), nomes, "Brasil", "majoritario")
    virada = next(e for e in evs if e["type"] == "lead_change")
    assert "BIA passou ANA" in virada["description"]
    assert eventos.detectar(_linha(60, "a"), _linha(61, "b"), nomes, "Brasil", "proporcional") == []
    assert eventos.detectar(None, _linha(50, "a", nivel="municipality"), nomes, "X", "majoritario") == []


def test_eventos_elected_e_runoff():
    evs = eventos.detectar(
        _linha(99, "a"),
        _linha(100, "a"),
        {"a": "ANA", "b": "BIA"},
        "Brasil",
        "majoritario",
        {"a": "LEADING", "b": "COUNTING"},
        {"a": "RUNOFF", "b": "RUNOFF"},
    )
    assert [e["type"] for e in evs].count("runoff") == 2
    evs = eventos.detectar(
        _linha(80, "a"),
        _linha(81, "a"),
        {"a": "ANA"},
        "Minas Gerais",
        "majoritario",
        {"a": "LEADING"},
        {"a": "MATHEMATICALLY_ELECTED"},
    )
    assert evs[-1]["type"] == "mathematically_decided"


def test_cores_estaveis():
    assert cores.colors_by_number([22, 13, 13]) == {13: cores.party_color(13), 22: cores.party_color(22)}
    assert cores.color_for_text("Federação Aurora") == cores.color_for_text("Federação Aurora")


def test_cores_por_partido():
    vermelho_pt = cores.PARTIES[13][1]
    assert cores.party_color(13) == vermelho_pt
    assert cores.party_color(13123) == vermelho_pt  # candidato a vereador do PT
    assert cores.candidate_color(13, None, None) == vermelho_pt
    assert cores.candidate_color(99, 13, None) == vermelho_pt
    assert cores.candidate_color(99, None, "pt") == vermelho_pt
    assert cores.alliance_color("Federação Brasil da Esperança - FE BRASIL (PT/PC do B/PV)") in {
        vermelho_pt,
        cores.PARTIES[65][1],
        cores.PARTIES[43][1],
    }
    assert cores.alliance_color("PT/PCdoB/PV") == vermelho_pt
