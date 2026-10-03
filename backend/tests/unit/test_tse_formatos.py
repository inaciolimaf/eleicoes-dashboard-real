"""Parsers dos arquivos do TSE, números/datas, catálogo e URLs."""

from datetime import UTC, datetime

from app.tse import numeros
from app.tse.catalogo import parse_catalogo
from app.tse.parsers import (
    parse_acompanhamento,
    parse_auxiliar,
    parse_municipios,
    parse_resultado,
    parse_secoes,
)
from app.tse.urls import MontadorUrls

CATALOGO = {
    "dg": "14/09/2026", "hg": "20:58:55", "f": "s", "idg": "145692058",
    "arq": [
        {"tp": "u", "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>"},
        {"tp": "aux", "dir": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/dados/<uf>/<municipio>/<zona>/<secao>"},
    ],
    "pl": [
        {"cd": "17801", "c": "ele2026", "dt": "26/04/2026", "e": [
            {"cd": "21270", "cdt2": "21271", "t": "1", "tp": "8", "nm": "Federal",
             "abr": [{"cd": "br", "cp": [{"cd": "1", "ds": "Presidente", "tp": "1"}]}]},
            {"cd": "21272", "cdt2": "21273", "t": "1", "tp": "1", "nm": "Estadual",
             "abr": [{"cd": "br", "cp": [{"cd": "3", "ds": "Governador", "tp": "1"}, {"cd": "6", "ds": "Deputado Federal", "tp": "2"}]}]},
        ]},
        {"cd": "100", "c": "ele2024", "dt": "06/10/2024", "e": [
            {"cd": "619", "cdt2": "", "t": "1", "tp": "3", "nm": "Municipal",
             "abr": [{"cd": "br", "cp": [{"cd": "11", "ds": "Prefeito", "tp": "1"}]}]},
        ]},
    ],
}

EA20 = {
    "ele": "21270", "t": "1", "f": "s", "dg": "28/09/2026", "hg": "15:51:39", "idg": "173967397",
    "dt": "28/09/2026", "ht": "15:50:00", "tf": "n", "md": "n",
    "s": {"ts": "100", "st": "50", "pst": "50,00", "pstn": "50"},
    "e": {"te": "1000", "est": "500", "c": "400", "a": "100", "pc": "80,00", "pa": "20,00"},
    "v": {"tv": "1000", "vv": "950", "vb": "20", "tvn": "30"},
    "carg": [{"cd": "0001", "agr": [
        {"n": "60134540", "nm": "PARTIDO 9996", "tp": "i", "par": [{"n": "68", "sg": "P 9996", "nm": "PARTIDO 9996", "cand": [
            {"n": "68", "sqcand": "41592494", "nm": "CANDIDATO 9987", "nmu": "CANDIDATO 9987", "dvt": "Válido", "vap": "600",
             "pvapn": "63,157894737", "e": "n", "st": "", "vs": [{"tp": "v", "sqcand": "1", "nm": "VICE"}]}]}]},
        {"n": "2", "nm": "PARTIDO 9995", "tp": "i", "par": [{"n": "45", "sg": "P 9995", "nm": "PARTIDO 9995", "cand": [
            {"n": "45", "sqcand": "41592500", "nm": "CANDIDATO 9980", "nmu": "CANDIDATO 9980", "dvt": "Válido", "vap": "350",
             "pvapn": "36,842105263"}]}]},
    ]}],
}


def test_numeros_strings_do_tse():
    assert numeros.inteiro("1234") == 1234
    assert numeros.inteiro("") == 0
    assert numeros.inteiro(None, 7) == 7
    assert numeros.decimal("63,157894737") == 63.157894737
    assert numeros.inteiro_ou_none("") is None
    assert numeros.sim_nao("s") and not numeros.sim_nao("n")


def test_datas_brasilia_para_utc():
    dt = numeros.data_hora("04/10/2026", "17:00:00")
    assert dt == datetime(2026, 10, 4, 20, 0, tzinfo=UTC)
    assert numeros.data_hora_je("20261004T171523") == datetime(2026, 10, 4, 20, 15, 23, tzinfo=UTC)
    assert numeros.data_hora("", "") is None
    assert numeros.formatar_data(dt) == ("04/10/2026", "17:00:00")


def test_catalogo_resolve_pelo_cargo_e_nao_pela_uf():
    cat = parse_catalogo(CATALOGO)
    assert cat.pleito_atual().cd == 17801
    pleito, eleicao = cat.resolver(3)
    assert eleicao.cd == 21272 and eleicao.cd_t2 == 21273
    assert [c.sistema for c in eleicao.cargos] == ["majoritario", "proporcional"]
    assert cat.resolver(1)[1].cd == 21270
    assert cat.resolver(99) is None
    assert cat.templates["u"].endswith("/dados/<uf>")


def test_urls_dos_arquivos():
    u = MontadorUrls("https://resultados.tse.jus.br/oficial", parse_catalogo(CATALOGO).templates, "ele2026", 3220)
    assert u.resultado(21270, 1) == "https://resultados.tse.jus.br/oficial/ele2026/21270/dados/br/br-c0001-e021270-u.json"
    assert u.resultado(21272, 3, "SP", 71072).endswith("/dados/sp/sp71072-c0003-e021272-u.json")
    assert u.resultado(21272, 3, "sp", 71072, 1).endswith("/sp71072-z0001-c0003-e021272-u.json")
    assert u.acompanhamento(21270, "rj").endswith("/21270/dados/rj/rj-e021270-ab.json")
    assert u.municipios(21270).endswith("/21270/config/mun-e021270-cm.json")
    assert u.secoes("ap").endswith("/arquivo-urna/3220/config/ap/ap-p003220-cs.json")
    assert u.auxiliar_secao("ap", 6050, 2, 824).endswith(
        "/arquivo-urna/3220/dados/ap/06050/0002/0824/p003220-ap-m06050-z0002-s0824-aux.json")
    assert u.arquivo_urna("ap", 6050, 2, 824, "abc", "o.bu").endswith("/0824/abc/o.bu")
    assert "//" not in u.resultado(1, 1).split("://")[1]


def test_parse_resultado_unificado():
    r = parse_resultado(EA20, 1)
    assert r.cd_cargo == 1 and r.idg == "173967397"
    assert r.totais.votos_validos == 950 and r.totais.brancos == 20 and r.totais.nulos == 30
    assert r.totais.pct_secoes == 50.0
    assert r.totais.comparecimento == 400 and r.totais.pct_comparecimento == 80.0
    assert [c.numero for c in r.candidatos] == [68, 45]
    assert r.candidatos[0].pct_validos == 63.157894737
    assert r.candidatos[0].vices[0].nome == "VICE"
    assert r.totalizado_em == datetime(2026, 9, 28, 18, 50, tzinfo=UTC)
    assert not r.final and not r.matematicamente_definido


def test_parse_resultado_tolerante_a_campos_ausentes():
    r = parse_resultado({"ele": "1", "carg": [{"cd": "1", "agr": [{"par": [{"cand": [{"n": "13", "vap": "10"},
                                                                                   {"n": "22", "vap": "30"}]}]}]}]})
    assert r.totais.votos_validos == 40
    assert r.candidatos[0].numero == 22 and round(r.candidatos[0].pct_validos) == 75


def test_parse_acompanhamento_auxiliar_secoes_municipios():
    ab = parse_acompanhamento({"ele": "9100", "idg": "5", "abr": [
        {"tpabr": "uf", "cdabr": "SP", "dt": "04/10/2026", "ht": "18:00:00", "and": "p", "munf": "3",
         "s": {"ts": "10", "st": "4", "pst": "40,00"}, "e": {"te": "100", "c": "30"}},
        {"tpabr": "mu", "cdabr": "71072", "s": {"ts": "5", "st": "5"}}]})
    assert ab.itens[0].codigo == "sp" and ab.itens[0].pct_secoes == 40.0 and ab.itens[0].municipios_finalizados == 3
    assert ab.itens[1].tipo == "mu" and ab.itens[1].secoes_totalizadas == 5

    aux = parse_auxiliar({"st": "Totalizada", "hashes": [
        {"hash": "aa", "st": "Excluído", "dr": "04/10/2026", "hr": "18:00:00", "nmarq": ["x.bu"]},
        {"hash": "bb", "st": "Totalizado", "dr": "04/10/2026", "hr": "18:10:00", "nmarq": ["o.rdv", "o.bu"]}]})
    assert aux.urna_totalizada().hash == "bb" and aux.urna_totalizada().nome_bu() == "o.bu"
    assert parse_auxiliar({"st": "Não totalizada", "hashes": []}).urna_totalizada() is None

    secs = parse_secoes({"abr": [{"cd": "AP", "mu": [{"cd": "06050", "zon": [{"cd": "0002", "sec": [
        {"ns": "0824", "nsp": "0824"}, {"ns": "0825", "nsp": "0824"}]}]}]}]})
    assert [(s.uf, s.municipio, s.zona, s.secao, s.agregadora) for s in secs] == [
        ("ap", 6050, 2, 824, None), ("ap", 6050, 2, 825, 824)]

    mus = parse_municipios({"abr": [{"cd": "AC", "mu": [{"cd": "01120", "cdi": "1200013", "nm": "ACRELÂNDIA", "c": "N",
                                                          "z": ["0008", "0009"]}]}]})
    assert mus[0].uf == "ac" and mus[0].cd == 1120 and mus[0].cd_ibge == 1200013 and mus[0].zonas == [8, 9]
