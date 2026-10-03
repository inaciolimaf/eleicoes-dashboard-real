"""Regras de domínio: recortes, situação do candidato, eventos e cores."""

from datetime import UTC, datetime

import pytest

from app.services import cores, eventos, situacao
from app.services.recortes import FILHO, RecorteInvalido, parse


@pytest.mark.parametrize(("rid", "nivel"), [("br", "br"), ("sp", "uf"), ("sp71072", "municipio"),
                                            ("sp71072-z0001", "zona"), ("sp71072-z0001-l1015", "local"),
                                            ("sp71072-z0001-s0120", "secao")])
def test_recortes(rid, nivel):
    r = parse(rid)
    assert r.nivel == nivel and r.id == rid
    if nivel != "br":
        assert r.pai is not None


def test_recorte_detalhes_e_invalidos():
    r = parse("SP71072-Z0001-S0120")
    assert (r.uf, r.municipio, r.zona, r.secao) == ("sp", 71072, 1, 120)
    assert r.pai.id == "sp71072-z0001" and r.pai.pai.id == "sp71072" and r.pai.pai.pai.id == "sp"
    assert FILHO["zona"] == "local"
    for ruim in ("", "s", "sp7107", "sp71072-x0001", "123"):
        with pytest.raises(RecorteInvalido):
            parse(ruim)
    with pytest.raises(RecorteInvalido):
        parse("sp", "municipio")


@pytest.mark.parametrize(("e", "st", "dvt", "final", "esperado"), [
    (True, "Eleito", "Válido", True, situacao.ELEITO),
    (True, "Eleito", "Válido", False, situacao.MATEMATICAMENTE_ELEITO),
    (False, "Eleito por QP", "Válido", True, situacao.ELEITO),
    (False, "Eleito por média", "Válido", True, situacao.ELEITO),
    (False, "2º turno", "Válido", True, situacao.SEGUNDO_TURNO),
    (False, "Suplente", "Válido", True, situacao.SUPLENTE),
    (False, "Não eleito", "Válido", True, situacao.NAO_ELEITO),
    (False, "", "Anulado sub judice", False, situacao.SUB_JUDICE),
    (False, "", "Válido", False, None),
])
def test_situacao_vem_do_tse(e, st, dvt, final, esperado):
    assert situacao.da_tse(e, st, dvt, final, False) == esperado


def test_liderando_e_calculado_so_quando_tse_nao_definiu():
    cands = [{"sq": "a", "v": 100}, {"sq": "b", "v": 90}, {"sq": "c", "v": 0}]
    assert situacao.calcular(cands, 1, False, False, True) == {"a": "LIDERANDO", "b": "EM_APURACAO", "c": "EM_APURACAO"}
    # senado 2026: duas vagas
    assert situacao.calcular(cands, 2, False, False, True)["b"] == "LIDERANDO"
    # proporcional: ninguém "liderando"
    assert set(situacao.calcular(cands, 0, False, False, True).values()) == {"EM_APURACAO"}
    # abaixo da abrangência do cargo, a situação local ignora o "eleito" do TSE
    cands[0].update(e=True, st="Eleito")
    assert situacao.calcular(cands, 1, True, False, False)["a"] == "LIDERANDO"
    assert situacao.calcular(cands, 1, True, False, True)["a"] == "ELEITO"


def _linha(pct, lider, segundo="x", nivel="br", cd=1):
    return {"nivel": nivel, "cd_cargo": cd, "recorte_id": "br" if nivel == "br" else "mg", "turno": 1,
            "totalizado_em": datetime(2026, 10, 4, 22, tzinfo=UTC), "pct_secoes": pct, "lider_sqcand": lider,
            "segundo_sqcand": segundo, "lider_pct": 49.0, "segundo_pct": 48.0}


def test_eventos_inicio_marcos_e_virada():
    nomes = {"a": "ANA", "b": "BIA"}
    evs = eventos.detectar(_linha(0, None), _linha(26, "a"), nomes, "Brasil", "majoritario")
    tipos = [e["tipo"] for e in evs]
    assert tipos.count("marco") == 2 and "inicio" in tipos
    evs = eventos.detectar(_linha(60, "a", "b"), _linha(61, "b", "a"), nomes, "Brasil", "majoritario")
    virada = next(e for e in evs if e["tipo"] == "virada")
    assert "BIA passou ANA" in virada["descricao"]
    assert eventos.detectar(_linha(60, "a"), _linha(61, "b"), nomes, "Brasil", "proporcional") == []
    assert eventos.detectar(None, _linha(50, "a", nivel="municipio"), nomes, "X", "majoritario") == []


def test_eventos_eleito_e_segundo_turno():
    evs = eventos.detectar(_linha(99, "a"), _linha(100, "a"), {"a": "ANA", "b": "BIA"}, "Brasil", "majoritario",
                           {"a": "LIDERANDO", "b": "EM_APURACAO"}, {"a": "SEGUNDO_TURNO", "b": "SEGUNDO_TURNO"})
    assert [e["tipo"] for e in evs].count("segundo_turno") == 2
    evs = eventos.detectar(_linha(80, "a"), _linha(81, "a"), {"a": "ANA"}, "Minas Gerais", "majoritario",
                           {"a": "LIDERANDO"}, {"a": "MATEMATICAMENTE_ELEITO"})
    assert evs[-1]["tipo"] == "matematicamente_definido"


def test_cores_estaveis():
    assert cores.cores_por_numero([22, 13, 13]) == {13: cores.PALETA[0], 22: cores.PALETA[1]}
    assert cores.cor_texto("Federação Aurora") == cores.cor_texto("Federação Aurora")
