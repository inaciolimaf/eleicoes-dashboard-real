"""O mock do TSE gera arquivos coerentes com o formato real e com as regras eleitorais."""

import numpy as np
import pytest

from app.tse.bu import decodificar
from app.tse.parsers import parse_acompanhamento, parse_resultado
from tse_fake.cenario import ELEICAO_ESTADUAL, ELEICAO_FEDERAL, Cenario
from tse_fake.divulgacao import Divulgacao


@pytest.fixture(scope="module")
def div():
    return Divulgacao(Cenario(semente=11, escala=0.05))


def test_cenario_deterministico(div):
    outro = Cenario(semente=11, escala=0.05)
    assert outro.n == div.c.n
    assert np.array_equal(outro.cargos[(1, "br")].votos, div.c.cargos[(1, "br")].votos)


def test_soma_dos_municipios_bate_com_o_brasil(div):
    t = 3600.0
    _, br = div.resultado(ELEICAO_FEDERAL, 1, "br", None, None, t)
    total = 0
    for uf in div.c.ufs:
        _, d = div.resultado(ELEICAO_FEDERAL, 1, uf, None, None, t)
        total += parse_resultado(d, 1).totais.votos_validos
    assert total == parse_resultado(br, 1).totais.votos_validos


def test_idg_so_muda_quando_o_conteudo_muda(div):
    m = div.c.municipios[0]
    tempos = sorted(div.c.sec_t[m.a:m.b])
    antes, _ = div.resultado(ELEICAO_FEDERAL, 1, m.uf, m.cd, None, tempos[0] - 60)
    igual, _ = div.resultado(ELEICAO_FEDERAL, 1, m.uf, m.cd, None, tempos[0] - 31)
    depois, _ = div.resultado(ELEICAO_FEDERAL, 1, m.uf, m.cd, None, tempos[-1] + 60)
    assert antes == igual != depois


def test_final_presidente_e_proporcional(div):
    fim = float(div.c.sec_t.max()) + 60
    _, br = div.resultado(ELEICAO_FEDERAL, 1, "br", None, None, fim)
    r = parse_resultado(br, 1)
    assert r.final and r.totais.pct_secoes == 100
    lider = r.candidatos[0]
    if lider.pct_validos > 50:
        assert lider.eleito and lider.situacao_tse == "Eleito"
    else:
        assert [c.situacao_tse for c in r.candidatos[:2]] == ["2º turno", "2º turno"]
    _, dep = div.resultado(ELEICAO_ESTADUAL, 6, "sp", None, None, fim)
    rd = parse_resultado(dep, 6)
    assert sum(a.vagas or 0 for a in rd.agremiacoes) == 70
    assert sum(1 for c in rd.candidatos if c.eleito) == 70
    _, sen = div.resultado(ELEICAO_ESTADUAL, 5, "rj", None, None, fim)
    assert sum(1 for c in parse_resultado(sen, 5).candidatos if c.eleito) == 2


def test_acompanhamento_e_boletim(div):
    t = float(np.median(div.c.sec_t))
    _, ab = div.acompanhamento(ELEICAO_FEDERAL, "br", t)
    a = parse_acompanhamento(ab)
    assert a.itens[0].tipo == "br" and 45 <= a.itens[0].pct_secoes <= 55
    assert len([i for i in a.itens if i.tipo == "uf"]) == 27
    i = int(np.argmin(div.c.sec_t))
    _, aux = div.auxiliar(i, float(div.c.sec_t[i]) + 1)
    assert aux["st"] == "Totalizada" and aux["hashes"][0]["nmarq"][2].endswith(".bu")
    bu = decodificar(div.boletim(i))
    pres = next(c for c in bu.cargos if c.cd_cargo == 1)
    assert pres.validos == int(div.c.cargos[(1, "br")].votos[i].sum())
    assert bu.comparecimento == int(div.c.sec_comp[i])
