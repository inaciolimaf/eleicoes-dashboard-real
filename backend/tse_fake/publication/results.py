"""Results feed of the mock: the result document of an office and the tracking (progress) document."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import numpy as np

from tse_fake.publication.formatting import (
    OFFICE_NAMES,
    electorate_block,
    format_datetime,
    last_change,
    pct2,
    pctn,
    round_of,
    sections_block,
)
from tse_fake.scenario.model import Candidate, StateOffice

if TYPE_CHECKING:
    from tse_fake.publication.core import Publication
    from tse_fake.publication.status import Situation

Area = tuple[str, int | None, int | None]  # (uf, municipality TSE code, zone number)


def result_document(
    pub: Publication,
    election: int,
    office_code: int,
    area: Area,
    t: float,
    only_elected: bool = False,
) -> tuple[str, dict[str, Any]] | None:
    state_code, municipality, zone = area
    office = pub.office(office_code, state_code)
    if office is None or office.election_code != election:
        return None
    if office_code != 1 and state_code == "br":
        return None
    times, start, end = pub.time_range(state_code, municipality, zone)
    generation, last = pub.generation(times, t)
    sums = pub.sums(office, start, end, t)
    situation, seats_by_alliance, decided, _ = pub.situation(office, t)
    votes = sums["votos"]
    party_votes = sums["legenda"]
    valid = int(votes.sum()) + (int(party_votes.sum()) if party_votes is not None else 0)
    total_voters = sums["c"] * office.votes_per_voter
    alliances = _alliance_list(office, votes, party_votes, situation, valid, seats_by_alliance, only_elected)
    document = {
        **_header(election, t, generation, last),
        "tf": "s" if sums["st"] == sums["ts"] else "n",
        "md": "s" if (decided and state_code == office.state_code and municipality is None) else "n",
        "s": sections_block(sums["ts"], sums["st"]),
        "e": electorate_block(sums["te"], sums["est"], sums["c"]),
        "v": _votes_block(total_voters, valid, sums["brancos"], sums["nulos"]),
        "carg": [_office_block(office_code, office, alliances)],
    }
    return generation, document


def _header(election: int, t: float, generation: str, last: float | None) -> dict[str, Any]:
    dg, hg = format_datetime(round_of(t))
    dt, ht = format_datetime(last if last is not None else 0.0)
    return {
        "ele": str(election),
        "t": "1",
        "f": "o",
        "dg": dg,
        "hg": hg,
        "idg": generation,
        "dt": dt,
        "ht": ht,
    }


def _office_block(office_code: int, office: StateOffice, alliances: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "cd": f"{office_code:04d}",
        "nmn": OFFICE_NAMES[office_code],
        "nv": str(office.seats),
        "agr": alliances,
    }


def _votes_block(total: int, valid: int, blank: int, null: int) -> dict[str, str]:
    return {
        "tv": str(total),
        "vv": str(valid),
        "pvv": pct2(valid, total),
        "vb": str(blank),
        "pvb": pct2(blank, total),
        "tvn": str(null),
        "ptvn": pct2(null, total),
        "vn": str(null),
    }


def _alliance_list(
    office: StateOffice,
    votes: np.ndarray,
    party_votes: np.ndarray | None,
    situation: Situation,
    valid: int,
    seats_by_alliance: dict[str, int],
    only_elected: bool,
) -> list[dict[str, Any]]:
    groups = _group_candidates(office, votes, situation, valid, only_elected)
    if party_votes is not None and not only_elected:
        _add_party_list_votes(groups, office, party_votes)
    items: list[dict[str, Any]] = []
    for name, group in sorted(groups.items(), key=lambda kv: -kv[1]["_v"]):
        parties = []
        for row in group["par"].values():
            row["cand"].sort(key=lambda x: -int(x["vap"]))
            parties.append(row)
        item: dict[str, Any] = {
            "n": group["n"],
            "nm": name,
            "tp": group["tp"],
            "tvtl": str(group["_v"]),
            "par": parties,
        }
        if seats_by_alliance:
            item["vag"] = str(seats_by_alliance.get(name, 0))
        items.append(item)
    return items


def _group_candidates(
    office: StateOffice,
    votes: np.ndarray,
    situation: Situation,
    valid: int,
    only_elected: bool,
) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for i, candidate in enumerate(office.candidates):
        flag, status = situation.get(candidate.tse_candidate_id, ("n", ""))
        if only_elected and flag != "s":
            continue
        party = candidate.party
        group = groups.setdefault(
            party.alliance,
            {"n": party.alliance_number, "nm": party.alliance, "tp": party.kind, "_v": 0, "par": {}},
        )
        row = group["par"].setdefault(
            party.acronym,
            {"n": str(party.number), "sg": party.acronym, "nm": party.name, "tvl": "0", "cand": []},
        )
        count = int(votes[i])
        group["_v"] += count
        row["cand"].append(_candidate_entry(candidate, flag, status, count, valid))
    return groups


def _candidate_entry(candidate: Candidate, flag: str, status: str, count: int, valid: int) -> dict[str, Any]:
    return {
        "seq": "0",
        "n": str(candidate.ballot_number),
        "sqcand": candidate.tse_candidate_id,
        "nm": candidate.name,
        "nmu": candidate.ballot_name,
        "dvt": "Válido",
        "e": flag,
        "st": status,
        "vap": str(count),
        "pvap": pct2(count, valid),
        "pvapn": pctn(count, valid),
        "vs": [
            {"tp": kind, "nm": name, "nmu": name, "sgp": candidate.party.acronym}
            for kind, name in candidate.running_mate_candidates
        ],
    }


def _add_party_list_votes(
    groups: dict[str, dict[str, Any]], office: StateOffice, party_votes: np.ndarray
) -> None:
    for j, party in enumerate(office.parties):
        group = groups.get(party.alliance)
        if group and party.acronym in group["par"]:
            group["par"][party.acronym]["tvl"] = str(int(party_votes[j]))
            group["_v"] += int(party_votes[j])


def tracking_document(
    pub: Publication, election: int, state_code: str, t: float
) -> tuple[str, dict[str, Any]]:
    scenario = pub.scenario
    times, start, end = pub.time_range(state_code, None, None)
    generation, _ = pub.generation(times, t)
    dg, hg = format_datetime(round_of(t))
    items = [_tracking_item(pub, "br" if state_code == "br" else "uf", state_code, start, end, times, t)]
    if state_code == "br":
        for state in scenario.states:
            state_start, state_end = scenario.state_ranges[state]
            items.append(_tracking_item(pub, "uf", state, state_start, state_end, pub.state_times[state], t))
    else:
        for m in scenario.municipalities:
            if m.state_code == state_code:
                times_mun = pub.municipality_times[m.idx]
                items.append(_tracking_item(pub, "mun", f"{m.tse_code:05d}", m.start, m.end, times_mun, t))
    document = {"ele": str(election), "t": "1", "f": "o", "dg": dg, "hg": hg, "idg": generation, "abr": items}
    return generation, document


def _tracking_item(
    pub: Publication,
    kind: str,
    code: str,
    start: int,
    end: int,
    times: np.ndarray,
    t: float,
) -> dict[str, Any]:
    scenario = pub.scenario
    mask = scenario.section_time[start:end] <= t
    total = end - start
    tallied = int(mask.sum())
    voters = scenario.section_voters[start:end]
    last = last_change(times, t)
    dt, ht = format_datetime(last if last is not None else 0.0)
    item: dict[str, Any] = {
        "and": "f" if tallied == total else ("p" if tallied else "n"),
        "tpabr": kind,
        "cdabr": code,
        "dt": dt,
        "ht": ht,
        "s": sections_block(total, tallied),
        "e": electorate_block(
            int(voters.sum()),
            int(voters[mask].sum()),
            int(scenario.section_turnout[start:end][mask].sum()),
        ),
    }
    if kind in ("br", "uf"):
        item.update(_municipality_counts(pub, kind, code, t))
    return item


def _municipality_counts(pub: Publication, kind: str, code: str, t: float) -> dict[str, str]:
    municipalities = [m for m in pub.scenario.municipalities if kind == "br" or m.state_code == code]
    finished = partial = 0
    for m in municipalities:
        k = int(np.searchsorted(pub.municipality_times[m.idx], t, side="right"))
        if k == m.end - m.start:
            finished += 1
        elif k > 0:
            partial += 1
    missing = len(municipalities) - finished - partial
    count = len(municipalities)
    return {
        "munf": str(finished),
        "pmunf": pct2(finished, count),
        "munpt": str(partial),
        "pmunpt": pct2(partial, count),
        "munnr": str(missing),
        "pmunnr": pct2(missing, count),
    }
