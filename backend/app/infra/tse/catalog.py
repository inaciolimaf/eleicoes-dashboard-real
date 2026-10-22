"""Parser of the election catalog (EA11 - ele-c) and resolution of the election that holds an office."""

from dataclasses import dataclass, field
from typing import Any

from app.infra.tse.numbers import integer, integer_or_none

ELECTION_TYPES = {8: "federal", 1: "estadual", 3: "municipal"}

OFFICE_NAMES = {
    1: "Presidente",
    3: "Governador",
    5: "Senador",
    6: "Deputado Federal",
    7: "Deputado Estadual",
    8: "Deputado Distrital",
    11: "Prefeito",
    13: "Vereador",
}


@dataclass
class CatalogOffice:
    cd: int
    name: str
    system: str  # majoritario | proporcional

    @property
    def abrangencia(self) -> str:
        return "br" if self.cd == 1 else "uf"


@dataclass
class CatalogElection:
    cd: int
    cd_t2: int | None
    round: int
    tipo: str
    name: str
    offices: list[CatalogOffice] = field(default_factory=list)


@dataclass
class CatalogEvent:
    cd: int
    cycle: str
    data: str
    elections: list[CatalogElection] = field(default_factory=list)


@dataclass
class Catalog:
    generation_id: str
    templates: dict[str, str]
    events: list[CatalogEvent]

    def pleito_atual(self) -> CatalogEvent | None:
        """Most recent election event (by the dd/mm/yyyy date)."""
        if not self.events:
            return None

        def date_key(event: CatalogEvent) -> tuple[int, int, int]:
            try:
                day, month, year = (int(x) for x in event.data.split("/"))
                return year, month, day
            except ValueError:
                return 0, 0, 0

        return max(self.events, key=date_key)

    def resolver(
        self, office_code: int, round_number: int = 1
    ) -> tuple[CatalogEvent, CatalogElection] | None:
        """Finds the election that holds the office. Matches by the office code (cp[].cd), never by the UF:
        in the real catalog `abr[].cd` is always "br", including for state offices."""
        candidates: list[tuple[CatalogEvent, CatalogElection]] = []
        for event in self.events:
            for election in event.elections:
                if election.round == round_number and any(c.cd == office_code for c in election.offices):
                    candidates.append((event, election))
        if not candidates:
            return None
        current = self.pleito_atual()
        for event, election in candidates:
            if current and event.cd == current.cd:
                return event, election
        return candidates[0]


def _parse_offices(election: dict[str, Any]) -> list[CatalogOffice]:
    offices: list[CatalogOffice] = []
    seen: set[int] = set()
    for area in election.get("abr", []) or []:
        for entry in area.get("cp", []) or []:
            code = integer(entry.get("cd"))
            if code in seen:
                continue
            seen.add(code)
            system = "proporcional" if str(entry.get("tp")) == "2" else "majoritario"
            name = str(entry.get("ds") or OFFICE_NAMES.get(code, f"Cargo {code}"))
            offices.append(CatalogOffice(cd=code, name=name, system=system))
    return offices


def _parse_election(entry: dict[str, Any]) -> CatalogElection:
    kind = integer(entry.get("tp"))
    return CatalogElection(
        cd=integer(entry.get("cd")),
        cd_t2=integer_or_none(entry.get("cdt2")),
        round=integer(entry.get("t"), 1),
        tipo=ELECTION_TYPES.get(kind, str(kind)),
        name=str(entry.get("nm") or ""),
        offices=_parse_offices(entry),
    )


def _parse_event(entry: dict[str, Any], root_cycle: str) -> CatalogEvent:
    event = CatalogEvent(
        cd=integer(entry.get("cd")), cycle=str(entry.get("c") or root_cycle), data=str(entry.get("dt") or "")
    )
    event.elections = [_parse_election(e) for e in entry.get("e", []) or []]
    return event


def parse_catalog(data: dict[str, Any]) -> Catalog:
    templates = {str(a.get("tp")): str(a.get("dir")) for a in data.get("arq", []) if a.get("tp")}
    root_cycle = str(data.get("c") or "")
    events = [_parse_event(entry, root_cycle) for entry in data.get("pl", []) or []]
    return Catalog(generation_id=str(data.get("idg") or ""), templates=templates, events=events)


# Name used before the English rename; the collector and the ingestion still import it.
