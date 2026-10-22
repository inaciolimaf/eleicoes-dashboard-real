"""Geo area ids: a level plus an id, parsed from the id string.

br | sp | sp71072 | sp71072-z0001 | sp71072-z0001-l1015 | sp71072-z0001-s0120
"""

import re
from dataclasses import dataclass

LEVELS = ("country", "state", "municipality", "zone", "polling_place", "section")

#: The level one step below each level (what the children listing shows).
CHILD_LEVEL = {
    "country": "state",
    "state": "municipality",
    "municipality": "zone",
    "zone": "polling_place",
    "polling_place": "section",
}

_ID_PATTERN = re.compile(
    r"^(?P<uf>[a-z]{2})(?:(?P<mun>\d{5})(?:-z(?P<zona>\d{4})(?:-(?P<tipo>[ls])(?P<num>\d{4}))?)?)?$"
)


@dataclass(frozen=True)
class GeoArea:
    level: str
    id: str
    #: State code (two letters, lower case); `br` for the country has no state.
    uf: str | None = None
    municipality: int | None = None
    zone: int | None = None
    polling_place: int | None = None
    section: int | None = None

    @property
    def municipality_id(self) -> str | None:
        return f"{self.uf}{self.municipality:05d}" if self.municipality is not None else None

    @property
    def zone_id(self) -> str | None:
        return f"{self.municipality_id}-z{self.zone:04d}" if self.zone is not None else None

    @property
    def parent(self) -> "GeoArea | None":
        if self.level == "country":
            return None
        if self.level == "state":
            return GeoArea("country", "br")
        if self.level == "municipality":
            return GeoArea("state", self.uf or "", uf=self.uf)
        if self.level == "zone":
            return parse(self.municipality_id or "")
        if self.level in ("polling_place", "section"):
            return parse(self.zone_id or "")
        return None


class GeoAreaInvalid(ValueError):
    """The id does not match the geo area format, or it is not of the requested level."""


def parse(id_: str, level: str | None = None) -> GeoArea:
    id_ = (id_ or "").strip().lower()
    if id_ == "br":
        area = GeoArea("country", "br")
    else:
        match = _ID_PATTERN.match(id_)
        if not match:
            raise GeoAreaInvalid(id_)
        area = _from_match(id_, match)
    if level and level != area.level:
        raise GeoAreaInvalid(f"{id_} não é do nível {level}")
    return area


def _from_match(id_: str, match: re.Match[str]) -> GeoArea:
    uf = match["uf"]
    if match["mun"] is None:
        return GeoArea("state", id_, uf=uf)
    municipality = int(match["mun"])
    if match["zona"] is None:
        return GeoArea("municipality", id_, uf=uf, municipality=municipality)
    zone = int(match["zona"])
    if match["tipo"] is None:
        return GeoArea("zone", id_, uf=uf, municipality=municipality, zone=zone)
    number = int(match["num"])
    if match["tipo"] == "l":
        return GeoArea(
            "polling_place", id_, uf=uf, municipality=municipality, zone=zone, polling_place=number
        )
    return GeoArea("section", id_, uf=uf, municipality=municipality, zone=zone, section=number)
