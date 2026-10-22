"""The TSE mock generates files that match the real format and the electoral rules."""

import numpy as np
import pytest

from app.infra.tse.ballot_box import decode
from app.infra.tse.parsers import parse_result, parse_tracking
from tse_fake.publication import Publication
from tse_fake.scenario import FEDERAL_ELECTION_CODE, STATE_ELECTION_CODE, Scenario


@pytest.fixture(scope="module")
def div():
    return Publication(Scenario(seed=11, scale=0.05))


def test_cenario_deterministico(div):
    other = Scenario(seed=11, scale=0.05)
    assert other.section_count == div.scenario.section_count
    assert np.array_equal(other.offices[(1, "br")].votes, div.scenario.offices[(1, "br")].votes)


def test_soma_dos_municipios_bate_com_o_brasil(div):
    t = 3600.0
    _, national = div.result(FEDERAL_ELECTION_CODE, 1, "br", None, None, t)
    total = 0
    for uf in div.scenario.states:
        _, document = div.result(FEDERAL_ELECTION_CODE, 1, uf, None, None, t)
        total += parse_result(document, 1).totals.valid_votes
    assert total == parse_result(national, 1).totals.valid_votes


def test_idg_so_muda_quando_o_conteudo_muda(div):
    m = div.scenario.municipalities[0]
    times = sorted(div.scenario.section_time[m.start : m.end])
    before, _ = div.result(FEDERAL_ELECTION_CODE, 1, m.state_code, m.tse_code, None, times[0] - 60)
    same, _ = div.result(FEDERAL_ELECTION_CODE, 1, m.state_code, m.tse_code, None, times[0] - 31)
    after, _ = div.result(FEDERAL_ELECTION_CODE, 1, m.state_code, m.tse_code, None, times[-1] + 60)
    assert before == same != after


def test_final_presidente_e_proporcional(div):
    end = float(div.scenario.section_time.max()) + 60
    _, national = div.result(FEDERAL_ELECTION_CODE, 1, "br", None, None, end)
    result = parse_result(national, 1)
    assert result.final and result.totals.pct_sections == 100
    leader = result.candidates[0]
    if leader.pct_valid > 50:
        assert leader.elected and leader.tse_status == "Eleito"
    else:
        assert [c.tse_status for c in result.candidates[:2]] == ["2º turno", "2º turno"]
    _, deputies = div.result(STATE_ELECTION_CODE, 6, "sp", None, None, end)
    rd = parse_result(deputies, 6)
    assert sum(a.seats or 0 for a in rd.alliances) == 70
    assert sum(1 for c in rd.candidates if c.elected) == 70
    _, senators = div.result(STATE_ELECTION_CODE, 5, "rj", None, None, end)
    assert sum(1 for c in parse_result(senators, 5).candidates if c.elected) == 2


def test_acompanhamento_e_boletim(div):
    t = float(np.median(div.scenario.section_time))
    _, tracking = div.tracking(FEDERAL_ELECTION_CODE, "br", t)
    a = parse_tracking(tracking)
    assert a.items[0].tipo == "br" and 45 <= a.items[0].pct_sections <= 55
    assert len([i for i in a.items if i.tipo == "uf"]) == 27
    i = int(np.argmin(div.scenario.section_time))
    _, aux = div.auxiliary(i, float(div.scenario.section_time[i]) + 1)
    assert aux["st"] == "Totalizada" and aux["hashes"][0]["nmarq"][2].endswith(".bu")
    bu = decode(div.ballot_box(i))
    pres = next(c for c in bu.offices if c.office_code == 1)
    assert pres.validos == int(div.scenario.offices[(1, "br")].votes[i].sum())
    assert bu.turnout == int(div.scenario.section_turnout[i])
