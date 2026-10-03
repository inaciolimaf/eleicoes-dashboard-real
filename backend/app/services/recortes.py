"""Identificadores de recorte geográfico.

br | sp | sp71072 | sp71072-z0001 | sp71072-z0001-l1015 | sp71072-z0001-s0120
"""

import re
from dataclasses import dataclass

NIVEIS = ("br", "uf", "municipio", "zona", "local", "secao")
FILHO = {"br": "uf", "uf": "municipio", "municipio": "zona", "zona": "local", "local": "secao"}

_RE = re.compile(r"^(?P<uf>[a-z]{2})(?:(?P<mun>\d{5})(?:-z(?P<zona>\d{4})(?:-(?P<tipo>[ls])(?P<num>\d{4}))?)?)?$")


@dataclass(frozen=True)
class Recorte:
    nivel: str
    id: str
    uf: str | None = None
    municipio: int | None = None
    zona: int | None = None
    local: int | None = None
    secao: int | None = None

    @property
    def municipio_id(self) -> str | None:
        return f"{self.uf}{self.municipio:05d}" if self.municipio is not None else None

    @property
    def zona_id(self) -> str | None:
        return f"{self.municipio_id}-z{self.zona:04d}" if self.zona is not None else None

    @property
    def pai(self) -> "Recorte | None":
        if self.nivel == "br":
            return None
        if self.nivel == "uf":
            return Recorte("br", "br")
        if self.nivel == "municipio":
            return Recorte("uf", self.uf or "", uf=self.uf)
        if self.nivel == "zona":
            return parse(self.municipio_id or "")
        if self.nivel in ("local", "secao"):
            return parse(self.zona_id or "")
        return None


class RecorteInvalido(ValueError):
    pass


def parse(id_: str, nivel: str | None = None) -> Recorte:
    id_ = (id_ or "").strip().lower()
    if id_ == "br":
        r = Recorte("br", "br")
    else:
        m = _RE.match(id_)
        if not m:
            raise RecorteInvalido(id_)
        uf = m["uf"]
        if m["mun"] is None:
            r = Recorte("uf", id_, uf=uf)
        elif m["zona"] is None:
            r = Recorte("municipio", id_, uf=uf, municipio=int(m["mun"]))
        elif m["tipo"] is None:
            r = Recorte("zona", id_, uf=uf, municipio=int(m["mun"]), zona=int(m["zona"]))
        elif m["tipo"] == "l":
            r = Recorte("local", id_, uf=uf, municipio=int(m["mun"]), zona=int(m["zona"]), local=int(m["num"]))
        else:
            r = Recorte("secao", id_, uf=uf, municipio=int(m["mun"]), zona=int(m["zona"]), secao=int(m["num"]))
    if nivel and nivel != r.nivel:
        raise RecorteInvalido(f"{id_} não é do nível {nivel}")
    return r


def municipio_id(uf: str, cd: int) -> str:
    return f"{uf.lower()}{cd:05d}"


def zona_id(uf: str, cd_mun: int, zona: int) -> str:
    return f"{municipio_id(uf, cd_mun)}-z{zona:04d}"


def local_id(uf: str, cd_mun: int, zona: int, local: int) -> str:
    return f"{zona_id(uf, cd_mun, zona)}-l{local:04d}"


def secao_id(uf: str, cd_mun: int, zona: int, secao: int) -> str:
    return f"{zona_id(uf, cd_mun, zona)}-s{secao:04d}"
