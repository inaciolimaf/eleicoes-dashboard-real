"""Montagem das URLs dos arquivos de divulgação.

O diretório vem SEMPRE do template publicado no catálogo (`arq[].dir`). Só o nome do arquivo é regra fixa.
`<base>` e `<ambiente>` já estão embutidos na base configurada (ex.: https://resultados.tse.jus.br/oficial).
"""

import re

PADROES_PADRAO = {
    "cm": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/config",
    "ab": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>",
    "u": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>",
    "e": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/dados/<uf>",
    "ft": "<base>/<ambiente>/<ciclo>/<cd_eleicao>/fotos/<uf>",
    "cs": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/config/<uf>",
    "aux": "<base>/<ambiente>/<ciclo>/arquivo-urna/<cd_pleito>/dados/<uf>/<municipio>/<zona>/<secao>",
}


def pad(n: int | str, largura: int) -> str:
    return str(int(n)).zfill(largura)


def preencher(
    template: str,
    base: str,
    ciclo: str,
    cd_eleicao: int | None = None,
    uf: str = "br",
    cd_pleito: int | None = None,
    municipio: int | None = None,
    zona: int | None = None,
    secao: int | None = None,
) -> str:
    valores = {
        "<base>": base.rstrip("/"),
        "<ambiente>": "",
        "<ciclo>": ciclo,
        "<cd_eleicao>": str(cd_eleicao) if cd_eleicao is not None else "",
        "<uf>": uf.lower(),
        "<cd_pleito>": str(cd_pleito) if cd_pleito is not None else "",
        "<municipio>": pad(municipio, 5) if municipio is not None else "",
        "<zona>": pad(zona, 4) if zona is not None else "",
        "<secao>": pad(secao, 4) if secao is not None else "",
    }
    saida = template
    for chave, valor in valores.items():
        saida = saida.replace(chave, valor)
    return re.sub(r"(?<!:)/{2,}", "/", saida)


class MontadorUrls:
    def __init__(self, base: str, templates: dict[str, str], ciclo: str, cd_pleito: int, extensao: str = "json"):
        self.base = base
        self.templates = {**PADROES_PADRAO, **templates}
        self.ciclo = ciclo
        self.cd_pleito = cd_pleito
        self.ext = extensao

    def _dir(self, tp: str, **kw: object) -> str:
        return preencher(self.templates[tp], self.base, self.ciclo, cd_pleito=self.cd_pleito, **kw)  # type: ignore[arg-type]

    def municipios(self, cd_eleicao: int) -> str:
        return f"{self._dir('cm', cd_eleicao=cd_eleicao)}/mun-e{pad(cd_eleicao, 6)}-cm.{self.ext}"

    def acompanhamento(self, cd_eleicao: int, uf: str = "br") -> str:
        uf = uf.lower()
        return f"{self._dir('ab', cd_eleicao=cd_eleicao, uf=uf)}/{uf}-e{pad(cd_eleicao, 6)}-ab.{self.ext}"

    def resultado(
        self, cd_eleicao: int, cd_cargo: int, uf: str = "br", municipio: int | None = None, zona: int | None = None,
        tipo: str = "u",
    ) -> str:
        uf = uf.lower()
        abr = uf
        if municipio is not None:
            abr += pad(municipio, 5)
            if zona is not None:
                abr += f"-z{pad(zona, 4)}"
        return f"{self._dir(tipo, cd_eleicao=cd_eleicao, uf=uf)}/{abr}-c{pad(cd_cargo, 4)}-e{pad(cd_eleicao, 6)}-{tipo}.{self.ext}"

    def foto(self, cd_eleicao: int, uf: str, sqcand: str) -> str:
        return f"{self._dir('ft', cd_eleicao=cd_eleicao, uf=uf)}/{sqcand}.jpeg"

    def secoes(self, uf: str) -> str:
        uf = uf.lower()
        return f"{self._dir('cs', uf=uf)}/{uf}-p{pad(self.cd_pleito, 6)}-cs.json"

    def auxiliar_secao(self, uf: str, municipio: int, zona: int, secao: int) -> str:
        uf = uf.lower()
        d = self._dir("aux", uf=uf, municipio=municipio, zona=zona, secao=secao)
        nome = f"p{pad(self.cd_pleito, 6)}-{uf}-m{pad(municipio, 5)}-z{pad(zona, 4)}-s{pad(secao, 4)}-aux.json"
        return f"{d}/{nome}"

    def arquivo_urna(self, uf: str, municipio: int, zona: int, secao: int, hash_: str, nome: str) -> str:
        d = self._dir("aux", uf=uf, municipio=municipio, zona=zona, secao=secao)
        return f"{d}/{hash_}/{nome}"
