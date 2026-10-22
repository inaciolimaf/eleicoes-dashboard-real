"""URLs of the TSE dissemination files.

The directory ALWAYS comes from the template published in the catalog (`arq[].dir`). Only the file name
follows a fixed rule. `<base>` and `<ambiente>` are already part of the configured base
(e.g. https://resultados.tse.jus.br/oficial).
"""

import re
from dataclasses import dataclass

DEFAULT_TEMPLATES = {
    "cm": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/config",
    "ab": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>",
    "u": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>",
    "e": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>",
    "ft": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/fotos/<uf>",
    "cs": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/config/<uf>",
    "aux": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/dados/<uf>/<municipio>/<zona>/<secao>",
}


@dataclass(frozen=True)
class UrlParams:
    """Values that fill the placeholders of a URL template."""

    election_code: int | None = None
    uf: str = "br"
    event_code: int | None = None
    municipality: int | None = None
    zone: int | None = None
    section: int | None = None


def pad(number: int | str, width: int) -> str:
    return str(int(number)).zfill(width)


def fill_template(template: str, base: str, cycle: str, params: UrlParams | None = None) -> str:
    p = params or UrlParams()
    values = {
        "<base>": base.rstrip("/"),
        "<ambiente>": "",
        "<ciclo>": cycle,
        "<cd_eleicao>": str(p.election_code) if p.election_code is not None else "",
        "<uf>": p.uf.lower(),
        "<cd_pleito>": str(p.event_code) if p.event_code is not None else "",
        "<municipio>": pad(p.municipality, 5) if p.municipality is not None else "",
        "<zona>": pad(p.zone, 4) if p.zone is not None else "",
        "<secao>": pad(p.section, 4) if p.section is not None else "",
    }
    result = template
    for placeholder, value in values.items():
        result = result.replace(placeholder, value)
    return re.sub(r"(?<!:)/{2,}", "/", result)


class UrlBuilder:
    """Builds the URLs of one election event.

    Method names are called by the collector and the public service, so they stay in Portuguese for now.
    """

    def __init__(
        self, base: str, templates: dict[str, str], cycle: str, event_code: int, extension: str = "json"
    ) -> None:
        self.base = base
        self.templates = {**DEFAULT_TEMPLATES, **templates}
        self.cycle = cycle
        self.event_code = event_code
        self.ext = extension

    def _dir(self, template_key: str, params: UrlParams) -> str:
        return fill_template(self.templates[template_key], self.base, self.cycle, params)

    def municipios(self, cd_eleicao: int) -> str:
        directory = self._dir("cm", UrlParams(event_code=self.event_code, election_code=cd_eleicao))
        return f"{directory}/mun-e{pad(cd_eleicao, 6)}-cm.{self.ext}"

    def acompanhamento(self, cd_eleicao: int, uf: str = "br") -> str:
        uf = uf.lower()
        directory = self._dir("ab", UrlParams(event_code=self.event_code, election_code=cd_eleicao, uf=uf))
        return f"{directory}/{uf}-e{pad(cd_eleicao, 6)}-ab.{self.ext}"

    def resultado(
        self,
        cd_eleicao: int,
        cd_cargo: int,
        uf: str = "br",
        municipio: int | None = None,
        zona: int | None = None,
        tipo: str = "u",
    ) -> str:
        uf = uf.lower()
        area = uf
        if municipio is not None:
            area += pad(municipio, 5)
            if zona is not None:
                area += f"-z{pad(zona, 4)}"
        name = f"{area}-c{pad(cd_cargo, 4)}-e{pad(cd_eleicao, 6)}-{tipo}"
        directory = self._dir(tipo, UrlParams(event_code=self.event_code, election_code=cd_eleicao, uf=uf))
        return f"{directory}/{name}.{self.ext}"

    def foto(self, cd_eleicao: int, uf: str, sqcand: str) -> str:
        directory = self._dir("ft", UrlParams(event_code=self.event_code, election_code=cd_eleicao, uf=uf))
        return f"{directory}/{sqcand}.jpeg"

    def secoes(self, uf: str) -> str:
        uf = uf.lower()
        directory = self._dir("cs", UrlParams(event_code=self.event_code, uf=uf))
        return f"{directory}/{uf}-p{pad(self.event_code, 6)}-cs.json"

    def auxiliar_secao(self, uf: str, municipio: int, zona: int, secao: int) -> str:
        uf = uf.lower()
        directory = self._dir(
            "aux",
            UrlParams(event_code=self.event_code, uf=uf, municipality=municipio, zone=zona, section=secao),
        )
        name = (
            f"p{pad(self.event_code, 6)}-{uf}-m{pad(municipio, 5)}-z{pad(zona, 4)}-s{pad(secao, 4)}-aux.json"
        )
        return f"{directory}/{name}"

    def arquivo_urna(self, uf: str, municipio: int, zona: int, secao: int, hash_: str, nome: str) -> str:
        directory = self._dir(
            "aux",
            UrlParams(event_code=self.event_code, uf=uf, municipality=municipio, zone=zona, section=secao),
        )
        return f"{directory}/{hash_}/{nome}"


# Name used before the English rename; the collector and the public service still import it.
MontadorUrls = UrlBuilder
