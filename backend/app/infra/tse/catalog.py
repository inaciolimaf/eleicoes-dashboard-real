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
    nome: str
    sistema: str  # majoritario | proporcional

    @property
    def abrangencia(self) -> str:
        return "br" if self.cd == 1 else "uf"


@dataclass
class CatalogElection:
    cd: int
    cd_t2: int | None
    turno: int
    tipo: str
    nome: str
    cargos: list[CatalogOffice] = field(default_factory=list)


@dataclass
class CatalogEvent:
    cd: int
    ciclo: str
    data: str
    eleicoes: list[CatalogElection] = field(default_factory=list)


@dataclass
class Catalog:
    idg: str
    templates: dict[str, str]
    pleitos: list[CatalogEvent]

    def pleito_atual(self) -> CatalogEvent | None:
        """Most recent election event (by the dd/mm/yyyy date)."""
        if not self.pleitos:
            return None

        def date_key(event: CatalogEvent) -> tuple[int, int, int]:
            try:
                day, month, year = (int(x) for x in event.data.split("/"))
                return year, month, day
            except ValueError:
                return 0, 0, 0

        return max(self.pleitos, key=date_key)

    def resolver(self, cd_cargo: int, turno: int = 1) -> tuple[CatalogEvent, CatalogElection] | None:
        """Finds the election that holds the office. Matches by the office code (cp[].cd), never by the UF:
        in the real catalog `abr[].cd` is always "br", including for state offices."""
        candidates: list[tuple[CatalogEvent, CatalogElection]] = []
        for event in self.pleitos:
            for election in event.eleicoes:
                if election.turno == turno and any(c.cd == cd_cargo for c in election.cargos):
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
            offices.append(CatalogOffice(cd=code, nome=name, sistema=system))
    return offices


def _parse_election(entry: dict[str, Any]) -> CatalogElection:
    kind = integer(entry.get("tp"))
    return CatalogElection(
        cd=integer(entry.get("cd")),
        cd_t2=integer_or_none(entry.get("cdt2")),
        turno=integer(entry.get("t"), 1),
        tipo=ELECTION_TYPES.get(kind, str(kind)),
        nome=str(entry.get("nm") or ""),
        cargos=_parse_offices(entry),
    )


def _parse_event(entry: dict[str, Any], root_cycle: str) -> CatalogEvent:
    event = CatalogEvent(
        cd=integer(entry.get("cd")), ciclo=str(entry.get("c") or root_cycle), data=str(entry.get("dt") or "")
    )
    event.eleicoes = [_parse_election(e) for e in entry.get("e", []) or []]
    return event


def parse_catalog(data: dict[str, Any]) -> Catalog:
    templates = {str(a.get("tp")): str(a.get("dir")) for a in data.get("arq", []) if a.get("tp")}
    root_cycle = str(data.get("c") or "")
    events = [_parse_event(entry, root_cycle) for entry in data.get("pl", []) or []]
    return Catalog(idg=str(data.get("idg") or ""), templates=templates, pleitos=events)


# Name used before the English rename; the collector and the ingestion still import it.
Catalogo = Catalog
parse_catalogo = parse_catalog
