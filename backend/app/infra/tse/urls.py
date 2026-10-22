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
    state_code: str = "br"
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
        "<uf>": p.state_code.lower(),
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

    Method names are called by the collector and the public service.
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

    def municipalities(self, election_code: int) -> str:
        directory = self._dir("cm", UrlParams(event_code=self.event_code, election_code=election_code))
        return f"{directory}/mun-e{pad(election_code, 6)}-cm.{self.ext}"

    def tracking(self, election_code: int, state_code: str = "br") -> str:
        state_code = state_code.lower()
        directory = self._dir(
            "ab", UrlParams(event_code=self.event_code, election_code=election_code, state_code=state_code)
        )
        return f"{directory}/{state_code}-e{pad(election_code, 6)}-ab.{self.ext}"

    def result(
        self,
        election_code: int,
        office_code: int,
        state_code: str = "br",
        municipality: int | None = None,
        zone: int | None = None,
        kind: str = "u",
    ) -> str:
        state_code = state_code.lower()
        area = state_code
        if municipality is not None:
            area += pad(municipality, 5)
            if zone is not None:
                area += f"-z{pad(zone, 4)}"
        name = f"{area}-c{pad(office_code, 4)}-e{pad(election_code, 6)}-{kind}"
        directory = self._dir(
            kind, UrlParams(event_code=self.event_code, election_code=election_code, state_code=state_code)
        )
        return f"{directory}/{name}.{self.ext}"

    def foto(self, election_code: int, state_code: str, tse_candidate_id: str) -> str:
        directory = self._dir(
            "ft", UrlParams(event_code=self.event_code, election_code=election_code, state_code=state_code)
        )
        return f"{directory}/{tse_candidate_id}.jpeg"

    def sections(self, state_code: str) -> str:
        state_code = state_code.lower()
        directory = self._dir("cs", UrlParams(event_code=self.event_code, state_code=state_code))
        return f"{directory}/{state_code}-p{pad(self.event_code, 6)}-cs.json"

    def section_auxiliary(self, state_code: str, municipality: int, zone: int, section: int) -> str:
        state_code = state_code.lower()
        directory = self._dir(
            "aux",
            UrlParams(
                event_code=self.event_code,
                state_code=state_code,
                municipality=municipality,
                zone=zone,
                section=section,
            ),
        )
        name = (
            f"p{pad(self.event_code, 6)}-{state_code}-m{pad(municipality, 5)}"
            f"-z{pad(zone, 4)}-s{pad(section, 4)}-aux.json"
        )
        return f"{directory}/{name}"

    def ballot_box_file(
        self, state_code: str, municipality: int, zone: int, section: int, hash_: str, name: str
    ) -> str:
        directory = self._dir(
            "aux",
            UrlParams(
                event_code=self.event_code,
                state_code=state_code,
                municipality=municipality,
                zone=zone,
                section=section,
            ),
        )
        return f"{directory}/{hash_}/{name}"


# Name used before the English rename; the collector and the public service still import it.
