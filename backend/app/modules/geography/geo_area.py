"""Identificadores de área geográfica (geo area).

br | sp | sp71072 | sp71072-z0001 | sp71072-z0001-l1015 | sp71072-z0001-s0120
"""

import re
from dataclasses import dataclass

LEVELS = ("country", "state", "municipality", "zone", "polling_place", "section")
CHILD_LEVEL = {
    "country": "state",
    "state": "municipality",
    "municipality": "zone",
    "zone": "polling_place",
    "polling_place": "section",
}

_RE = re.compile(
    r"^(?P<uf>[a-z]{2})(?:(?P<mun>\d{5})(?:-z(?P<zona>\d{4})(?:-(?P<tipo>[ls])(?P<num>\d{4}))?)?)?$"
)


@dataclass(frozen=True)
class GeoArea:
    level: str
    id: str
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
    pass


def parse(id_: str, level: str | None = None) -> GeoArea:
    id_ = (id_ or "").strip().lower()
    if id_ == "br":
        r = GeoArea("country", "br")
    else:
        m = _RE.match(id_)
        if not m:
            raise GeoAreaInvalid(id_)
        uf = m["uf"]
        if m["mun"] is None:
            r = GeoArea("state", id_, uf=uf)
        elif m["zona"] is None:
            r = GeoArea("municipality", id_, uf=uf, municipality=int(m["mun"]))
        elif m["tipo"] is None:
            r = GeoArea("zone", id_, uf=uf, municipality=int(m["mun"]), zone=int(m["zona"]))
        elif m["tipo"] == "l":
            r = GeoArea(
                "polling_place",
                id_,
                uf=uf,
                municipality=int(m["mun"]),
                zone=int(m["zona"]),
                polling_place=int(m["num"]),
            )
        else:
            r = GeoArea(
                "section", id_, uf=uf, municipality=int(m["mun"]), zone=int(m["zona"]), section=int(m["num"])
            )
    if level and level != r.level:
        raise GeoAreaInvalid(f"{id_} não é do nível {level}")
    return r


def municipio_id(uf: str, cd: int) -> str:
    return f"{uf.lower()}{cd:05d}"


def zona_id(uf: str, cd_mun: int, zona: int) -> str:
    return f"{municipio_id(uf, cd_mun)}-z{zona:04d}"


def local_id(uf: str, cd_mun: int, zona: int, local: int) -> str:
    return f"{zona_id(uf, cd_mun, zona)}-l{local:04d}"


def secao_id(uf: str, cd_mun: int, zona: int, secao: int) -> str:
    return f"{zona_id(uf, cd_mun, zona)}-s{secao:04d}"
