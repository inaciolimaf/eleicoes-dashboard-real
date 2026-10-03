"""Parser do catálogo de eleições (EA11 - ele-c) e resolução de eleição por cargo."""

from dataclasses import dataclass, field

from app.tse.numeros import inteiro, inteiro_ou_none

TIPO_ELEICAO = {8: "federal", 1: "estadual", 3: "municipal"}

NOMES_CARGO = {
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
class CargoCatalogo:
    cd: int
    nome: str
    sistema: str  # majoritario | proporcional

    @property
    def abrangencia(self) -> str:
        return "br" if self.cd == 1 else "uf"


@dataclass
class EleicaoCatalogo:
    cd: int
    cd_t2: int | None
    turno: int
    tipo: str
    nome: str
    cargos: list[CargoCatalogo] = field(default_factory=list)


@dataclass
class PleitoCatalogo:
    cd: int
    ciclo: str
    data: str
    eleicoes: list[EleicaoCatalogo] = field(default_factory=list)


@dataclass
class Catalogo:
    idg: str
    templates: dict[str, str]
    pleitos: list[PleitoCatalogo]

    def pleito_atual(self) -> PleitoCatalogo | None:
        """Pleito mais recente (pela data dd/mm/aaaa)."""
        if not self.pleitos:
            return None

        def chave(p: PleitoCatalogo) -> tuple[int, int, int]:
            try:
                d, m, a = (int(x) for x in p.data.split("/"))
                return a, m, d
            except ValueError:
                return 0, 0, 0

        return max(self.pleitos, key=chave)

    def resolver(self, cd_cargo: int, turno: int = 1) -> tuple[PleitoCatalogo, EleicaoCatalogo] | None:
        """Encontra a eleição que contém o cargo. Casa pelo código do cargo (cp[].cd), nunca pela UF:
        no catálogo real `abr[].cd` é sempre "br", inclusive para cargos estaduais."""
        candidatos: list[tuple[PleitoCatalogo, EleicaoCatalogo]] = []
        for pleito in self.pleitos:
            for eleicao in pleito.eleicoes:
                if eleicao.turno == turno and any(c.cd == cd_cargo for c in eleicao.cargos):
                    candidatos.append((pleito, eleicao))
        if not candidatos:
            return None
        atual = self.pleito_atual()
        for p, e in candidatos:
            if atual and p.cd == atual.cd:
                return p, e
        return candidatos[0]


def parse_catalogo(dados: dict) -> Catalogo:
    templates = {str(a.get("tp")): str(a.get("dir")) for a in dados.get("arq", []) if a.get("tp")}
    pleitos: list[PleitoCatalogo] = []
    ciclo_raiz = str(dados.get("c") or "")
    for pl in dados.get("pl", []) or []:
        pleito = PleitoCatalogo(cd=inteiro(pl.get("cd")), ciclo=str(pl.get("c") or ciclo_raiz), data=str(pl.get("dt") or ""))
        for e in pl.get("e", []) or []:
            cargos: list[CargoCatalogo] = []
            vistos: set[int] = set()
            for abr in e.get("abr", []) or []:
                for cp in abr.get("cp", []) or []:
                    cd = inteiro(cp.get("cd"))
                    if cd in vistos:
                        continue
                    vistos.add(cd)
                    sistema = "proporcional" if str(cp.get("tp")) == "2" else "majoritario"
                    cargos.append(CargoCatalogo(cd=cd, nome=str(cp.get("ds") or NOMES_CARGO.get(cd, f"Cargo {cd}")), sistema=sistema))
            tp = inteiro(e.get("tp"))
            pleito.eleicoes.append(
                EleicaoCatalogo(
                    cd=inteiro(e.get("cd")),
                    cd_t2=inteiro_ou_none(e.get("cdt2")),
                    turno=inteiro(e.get("t"), 1),
                    tipo=TIPO_ELEICAO.get(tp, str(tp)),
                    nome=str(e.get("nm") or ""),
                    cargos=cargos,
                )
            )
        pleitos.append(pleito)
    return Catalogo(idg=str(dados.get("idg") or ""), templates=templates, pleitos=pleitos)
