"""Parsers of the TSE files, numbers and dates, catalog and URLs."""

from datetime import UTC, datetime

from app.infra.tse import numbers
from app.infra.tse.catalog import parse_catalog
from app.infra.tse.parsers import (
    parse_auxiliary,
    parse_municipalities,
    parse_result,
    parse_sections,
    parse_tracking,
)
from app.infra.tse.urls import UrlBuilder

CATALOGO = {
    "dg": "14/09/2026",
    "hg": "20:58:55",
    "f": "s",
    "idg": "145692058",
    "arq": [
        {"tp": "u", "dir": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>"},
        {
            "tp": "aux",
            "dir": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/dados/<uf>/<municipio>/<zona>/<secao>",
        },
    ],
    "pl": [
        {
            "cd": "17801",
            "c": "ele2026",
            "dt": "26/04/2026",
            "e": [
                {
                    "cd": "21270",
                    "cdt2": "21271",
                    "t": "1",
                    "tp": "8",
                    "nm": "Federal",
                    "abr": [{"cd": "br", "cp": [{"cd": "1", "ds": "Presidente", "tp": "1"}]}],
                },
                {
                    "cd": "21272",
                    "cdt2": "21273",
                    "t": "1",
                    "tp": "1",
                    "nm": "Estadual",
                    "abr": [
                        {
                            "cd": "br",
                            "cp": [
                                {"cd": "3", "ds": "Governador", "tp": "1"},
                                {"cd": "6", "ds": "Deputado Federal", "tp": "2"},
                            ],
                        }
                    ],
                },
            ],
        },
        {
            "cd": "100",
            "c": "ele2024",
            "dt": "06/10/2024",
            "e": [
                {
                    "cd": "619",
                    "cdt2": "",
                    "t": "1",
                    "tp": "3",
                    "nm": "Municipal",
                    "abr": [{"cd": "br", "cp": [{"cd": "11", "ds": "Prefeito", "tp": "1"}]}],
                },
            ],
        },
    ],
}

EA20 = {
    "ele": "21270",
    "t": "1",
    "f": "s",
    "dg": "28/09/2026",
    "hg": "15:51:39",
    "idg": "173967397",
    "dt": "28/09/2026",
    "ht": "15:50:00",
    "tf": "n",
    "md": "n",
    "s": {"ts": "100", "st": "50", "pst": "50,00", "pstn": "50"},
    "e": {"te": "1000", "est": "500", "c": "400", "a": "100", "pc": "80,00", "pa": "20,00"},
    "v": {"tv": "1000", "vv": "950", "vb": "20", "tvn": "30"},
    "carg": [
        {
            "cd": "0001",
            "agr": [
                {
                    "n": "60134540",
                    "nm": "PARTIDO 9996",
                    "tp": "i",
                    "par": [
                        {
                            "n": "68",
                            "sg": "P 9996",
                            "nm": "PARTIDO 9996",
                            "cand": [
                                {
                                    "n": "68",
                                    "sqcand": "41592494",
                                    "nm": "CANDIDATO 9987",
                                    "nmu": "CANDIDATO 9987",
                                    "dvt": "Válido",
                                    "vap": "600",
                                    "pvapn": "63,157894737",
                                    "e": "n",
                                    "st": "",
                                    "vs": [{"tp": "v", "sqcand": "1", "nm": "VICE"}],
                                }
                            ],
                        }
                    ],
                },
                {
                    "n": "2",
                    "nm": "PARTIDO 9995",
                    "tp": "i",
                    "par": [
                        {
                            "n": "45",
                            "sg": "P 9995",
                            "nm": "PARTIDO 9995",
                            "cand": [
                                {
                                    "n": "45",
                                    "sqcand": "41592500",
                                    "nm": "CANDIDATO 9980",
                                    "nmu": "CANDIDATO 9980",
                                    "dvt": "Válido",
                                    "vap": "350",
                                    "pvapn": "36,842105263",
                                }
                            ],
                        }
                    ],
                },
            ],
        }
    ],
}


def test_tse_number_strings():
    assert numbers.integer("1234") == 1234
    assert numbers.integer("") == 0
    assert numbers.integer(None, 7) == 7
    assert numbers.decimal("63,157894737") == 63.157894737
    assert numbers.integer_or_none("") is None
    assert numbers.yes_no("s") and not numbers.yes_no("n")


def test_datas_brasilia_para_utc():
    dt = numbers.date_time("04/10/2026", "17:00:00")
    assert dt == datetime(2026, 10, 4, 20, 0, tzinfo=UTC)
    assert numbers.date_time_je("20261004T171523") == datetime(2026, 10, 4, 20, 15, 23, tzinfo=UTC)
    assert numbers.date_time("", "") is None
    assert numbers.format_date(dt) == ("04/10/2026", "17:00:00")


def test_catalog_resolves_by_office_not_state():
    cat = parse_catalog(CATALOGO)
    assert cat.current_election_event().code == 17801
    _election_event, election = cat.resolver(3)
    assert election.code == 21272 and election.runoff_election_code == 21273
    assert [c.system for c in election.offices] == ["majoritario", "proporcional"]
    assert cat.resolver(1)[1].code == 21270
    assert cat.resolver(99) is None
    assert cat.templates["u"].endswith("/dados/<uf>")


def test_file_urls():
    u = UrlBuilder(
        "https://resultados.tse.jus.br/oficial", parse_catalog(CATALOGO).templates, "ele2026", 3220
    )
    assert (
        u.result(21270, 1)
        == "https://resultados.tse.jus.br/oficial/ele2026/21270/dados/br/br-c0001-e021270-u.json"
    )
    assert u.result(21272, 3, "SP", 71072).endswith("/dados/sp/sp71072-c0003-e021272-u.json")
    assert u.result(21272, 3, "sp", 71072, 1).endswith("/sp71072-z0001-c0003-e021272-u.json")
    assert u.tracking(21270, "rj").endswith("/21270/dados/rj/rj-e021270-ab.json")
    assert u.municipalities(21270).endswith("/21270/config/mun-e021270-cm.json")
    assert u.sections("ap").endswith("/arquivo-urna/3220/config/ap/ap-p003220-cs.json")
    assert u.section_auxiliary("ap", 6050, 2, 824).endswith(
        "/arquivo-urna/3220/dados/ap/06050/0002/0824/p003220-ap-m06050-z0002-s0824-aux.json"
    )
    assert u.ballot_box_file("ap", 6050, 2, 824, "abc", "o.bu").endswith("/0824/abc/o.bu")
    assert "//" not in u.result(1, 1).split("://")[1]


def test_parse_result_unificado():
    r = parse_result(EA20, 1)
    assert r.office_code == 1 and r.generation_id == "173967397"
    assert r.totals.valid_votes == 950 and r.totals.blank_votes == 20 and r.totals.null_votes == 30
    assert r.totals.pct_sections == 50.0
    assert r.totals.turnout == 400 and r.totals.pct_turnout == 80.0
    assert [c.number for c in r.candidates] == [68, 45]
    assert r.candidates[0].pct_valid == 63.157894737
    assert r.candidates[0].running_mates[0].name == "VICE"
    assert r.tallied_at == datetime(2026, 9, 28, 18, 50, tzinfo=UTC)
    assert not r.final and not r.mathematically_decided


def test_parse_result_tolerante_a_campos_ausentes():
    r = parse_result(
        {
            "ele": "1",
            "carg": [
                {
                    "cd": "1",
                    "agr": [{"par": [{"cand": [{"n": "13", "vap": "10"}, {"n": "22", "vap": "30"}]}]}],
                }
            ],
        }
    )
    assert r.totals.valid_votes == 40
    assert r.candidates[0].number == 22 and round(r.candidates[0].pct_valid) == 75


def test_parse_tracking_auxiliary_sections_municipalities():
    ab = parse_tracking(
        {
            "ele": "9100",
            "idg": "5",
            "abr": [
                {
                    "tpabr": "uf",
                    "cdabr": "SP",
                    "dt": "04/10/2026",
                    "ht": "18:00:00",
                    "and": "p",
                    "munf": "3",
                    "s": {"ts": "10", "st": "4", "pst": "40,00"},
                    "e": {"te": "100", "c": "30"},
                },
                {"tpabr": "mu", "cdabr": "71072", "s": {"ts": "5", "st": "5"}},
            ],
        }
    )
    assert (
        ab.items[0].code == "sp"
        and ab.items[0].pct_sections == 40.0
        and ab.items[0].municipalities_completed == 3
    )
    assert ab.items[1].kind == "mu" and ab.items[1].sections_tallied == 5

    aux = parse_auxiliary(
        {
            "st": "Totalizada",
            "hashes": [
                {"hash": "aa", "st": "Excluído", "dr": "04/10/2026", "hr": "18:00:00", "nmarq": ["x.bu"]},
                {
                    "hash": "bb",
                    "st": "Totalizado",
                    "dr": "04/10/2026",
                    "hr": "18:10:00",
                    "nmarq": ["o.rdv", "o.bu"],
                },
            ],
        }
    )
    assert aux.ballot_box_tallied().hash == "bb" and aux.ballot_box_tallied().ballot_box_name() == "o.bu"
    assert parse_auxiliary({"st": "Não totalizada", "hashes": []}).ballot_box_tallied() is None

    secs = parse_sections(
        {
            "abr": [
                {
                    "cd": "AP",
                    "mu": [
                        {
                            "cd": "06050",
                            "zon": [
                                {
                                    "cd": "0002",
                                    "sec": [{"ns": "0824", "nsp": "0824"}, {"ns": "0825", "nsp": "0824"}],
                                }
                            ],
                        }
                    ],
                }
            ]
        }
    )
    assert [(s.state_code, s.municipality, s.zone, s.section, s.aggregator) for s in secs] == [
        ("ap", 6050, 2, 824, None),
        ("ap", 6050, 2, 825, 824),
    ]

    mus = parse_municipalities(
        {
            "abr": [
                {
                    "cd": "AC",
                    "mu": [
                        {"cd": "01120", "cdi": "1200013", "nm": "ACRELÂNDIA", "c": "N", "z": ["0008", "0009"]}
                    ],
                }
            ]
        }
    )
    assert (
        mus[0].state_code == "ac"
        and mus[0].code == 1120
        and mus[0].ibge_code == 1200013
        and mus[0].zones == [8, 9]
    )


def test_polling_place_csv_zip_uses_brazil_csv():
    import io
    import zipfile

    from app.modules.results.ingestion import read_polling_place_csv

    cab = "SG_UF;CD_MUNICIPIO;NR_ZONA;NR_SECAO;NR_LOCAL_VOTACAO;NM_LOCAL_VOTACAO\n"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "eleitorado_local_votacao_2026_BA.csv",
            (cab + "BA;34576;79;197;1236;ESCOLA A\n").encode("latin-1"),
        )
        z.writestr(
            "eleitorado_local_votacao_2026_BRASIL.csv",
            (cab + "BA;34576;79;197;1236;ESCOLA A\nCE;13811;12;42;1015;COLÉGIO B\n").encode("latin-1"),
        )
        z.writestr("leiame.pdf", b"%PDF")
    lines = list(read_polling_place_csv(buf.getvalue()))
    assert [ln["SG_UF"] for ln in lines] == ["BA", "CE"]
    assert lines[1]["NM_LOCAL_VOTACAO"] == "COLÉGIO B"
    assert (
        next(iter(read_polling_place_csv((cab + "AP;06050;2;10;1;ESCOLA C\n").encode("latin-1"))))["NR_SECAO"]
        == "10"
    )


def test_missing_generation_id_uses_generation_time():
    """Without `idg`, each generation needs its own id; otherwise only the first would be written."""
    base = {k: v for k, v in EA20.items() if k != "idg"}
    r1 = parse_result({**base, "dg": "04/10/2026", "hg": "18:00:00"}, 1)
    r2 = parse_result({**base, "dg": "04/10/2026", "hg": "18:00:05"}, 1)
    assert r1.generation_id and r2.generation_id and r1.generation_id != r2.generation_id
    assert parse_result(EA20, 1).generation_id == str(EA20["idg"])
