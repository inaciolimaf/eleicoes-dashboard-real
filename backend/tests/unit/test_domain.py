"""Regras de domínio: recortes, situação do candidato, eventos e colors."""

from datetime import UTC, datetime

import pytest

from app.modules.elections import colors, status
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
def test_geo_areas(rid, nivel):
    r = parse(rid)
    assert r.level == nivel and r.id == rid
    if nivel != "country":
        assert r.parent is not None


def test_geo_area_details_and_invalid_ids():
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
        (True, "Eleito", "Válido", True, status.ELECTED),
        (True, "Eleito", "Válido", False, status.MATHEMATICALLY_ELECTED),
        (False, "Eleito por QP", "Válido", True, status.ELECTED),
        (False, "Eleito por média", "Válido", True, status.ELECTED),
        (False, "2º turno", "Válido", True, status.RUNOFF),
        (False, "Suplente", "Válido", True, status.SUBSTITUTE),
        (False, "Não eleito", "Válido", True, status.NOT_ELECTED),
        (False, "", "Anulado sub judice", False, status.SUB_JUDICE),
        (False, "", "Válido", False, None),
    ],
)
def test_status_comes_from_tse(e, st, dvt, final, esperado):
    assert status.from_tse(e, st, dvt, final, False) == esperado


def test_leading_is_computed_only_while_tse_has_not_decided():
    cands = [{"sq": "a", "v": 100}, {"sq": "b", "v": 90}, {"sq": "c", "v": 0}]
    assert status.calculate(cands, 1, False, False, True) == {
        "a": "LEADING",
        "b": "COUNTING",
        "c": "COUNTING",
    }
    # senado 2026: duas vagas
    assert status.calculate(cands, 2, False, False, True)["b"] == "LEADING"
    # proporcional: ninguém "liderando"
    assert set(status.calculate(cands, 0, False, False, True).values()) == {"COUNTING"}
    # abaixo da abrangência do cargo, a situação local ignora o "eleito" do TSE
    cands[0].update(e=True, st="Eleito")
    assert status.calculate(cands, 1, True, False, False)["a"] == "LEADING"
    assert status.calculate(cands, 1, True, False, True)["a"] == "ELECTED"


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


def test_events_start_milestones_and_lead_change():
    nomes = {"a": "ANA", "b": "BIA"}
    evs = eventos.detectar(_linha(0, None), _linha(26, "a"), nomes, "Brasil", "majoritario")
    tipos = [e["type"] for e in evs]
    assert tipos.count("milestone") == 2 and "start" in tipos
    evs = eventos.detectar(_linha(60, "a", "b"), _linha(61, "b", "a"), nomes, "Brasil", "majoritario")
    virada = next(e for e in evs if e["type"] == "lead_change")
    assert "BIA passou ANA" in virada["description"]
    assert eventos.detectar(_linha(60, "a"), _linha(61, "b"), nomes, "Brasil", "proporcional") == []
    assert eventos.detectar(None, _linha(50, "a", nivel="municipality"), nomes, "X", "majoritario") == []


def test_events_elected_and_runoff():
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


def test_colors_are_stable():
    assert colors.colors_by_number([22, 13, 13]) == {13: colors.party_color(13), 22: colors.party_color(22)}
    assert colors.color_for_text("Federação Aurora") == colors.color_for_text("Federação Aurora")


def test_colors_by_party():
    vermelho_pt = colors.PARTIES[13][1]
    assert colors.party_color(13) == vermelho_pt
    assert colors.party_color(13123) == vermelho_pt  # candidato a vereador do PT
    assert colors.candidate_color(13, None, None) == vermelho_pt
    assert colors.candidate_color(99, 13, None) == vermelho_pt
    assert colors.candidate_color(99, None, "pt") == vermelho_pt
    assert colors.alliance_color("Federação Brasil da Esperança - FE BRASIL (PT/PC do B/PV)") in {
        vermelho_pt,
        colors.PARTIES[65][1],
        colors.PARTIES[43][1],
    }
    assert colors.alliance_color("PT/PCdoB/PV") == vermelho_pt
