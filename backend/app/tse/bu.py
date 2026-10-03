"""Boletim de Urna (BU): decodificação ASN.1/BER conforme a especificação publicada pelo TSE (bu.asn1).

O arquivo `.bu` é um EntidadeEnvelopeGenerico cujo `conteudo` é um EntidadeBoletimUrna.
"""

from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import asn1tools

from app.tse.numeros import data_hora_je

SPEC = Path(__file__).parent / "asn1" / "bu.asn1"

TIPO_VOTO = {1: "nominal", 2: "branco", 3: "nulo", 4: "legenda", 5: "cargoSemCandidato"}
CARGO_CONSTITUCIONAL = {
    "presidente": 1, "governador": 3, "senador": 5, "deputadoFederal": 6, "deputadoEstadual": 7,
    "deputadoDistrital": 8, "prefeito": 11, "vereador": 13,
}


@lru_cache
def compilador() -> asn1tools.compiler.Specification:
    return asn1tools.compile_files([str(SPEC)], codec="ber", numeric_enums=False)


@dataclass
class VotoBU:
    tipo: str  # nominal | branco | nulo | legenda
    votos: int
    numero: int | None = None
    partido: int | None = None


@dataclass
class CargoBU:
    cd_cargo: int
    comparecimento: int
    votos: list[VotoBU] = field(default_factory=list)

    @property
    def validos(self) -> int:
        return sum(v.votos for v in self.votos if v.tipo in ("nominal", "legenda"))

    @property
    def brancos(self) -> int:
        return sum(v.votos for v in self.votos if v.tipo == "branco")

    @property
    def nulos(self) -> int:
        return sum(v.votos for v in self.votos if v.tipo == "nulo")


@dataclass
class BoletimUrna:
    municipio: int
    zona: int
    local: int
    secao: int
    emitido_em: datetime | None
    eleitores_aptos: int
    comparecimento: int
    cargos: list[CargoBU]


def _codigo_cargo(choice: tuple) -> int:
    tipo, valor = choice
    if tipo == "cargoConstitucional":
        return CARGO_CONSTITUCIONAL.get(valor, 0) if isinstance(valor, str) else int(valor)
    return int(valor)


def decodificar(conteudo: bytes) -> BoletimUrna:
    conv = compilador()
    envelope = conv.decode("EntidadeEnvelopeGenerico", conteudo)
    bu = conv.decode("EntidadeBoletimUrna", envelope["conteudo"])
    ident = bu["identificacaoSecao"]
    aptos = 0
    cargos: list[CargoBU] = []
    for por_eleicao in bu["resultadosVotacaoPorEleicao"]:
        aptos = max(aptos, int(por_eleicao["qtdEleitoresAptos"]))
        for resultado in por_eleicao["resultadosVotacao"]:
            comparecimento = int(resultado["qtdComparecimento"])
            for total in resultado["totaisVotosCargo"]:
                cargo = CargoBU(cd_cargo=_codigo_cargo(total["codigoCargo"]), comparecimento=comparecimento)
                for vv in total["votosVotaveis"]:
                    tipo = vv["tipoVoto"]
                    tipo = TIPO_VOTO.get(tipo, str(tipo)) if isinstance(tipo, int) else tipo
                    ident_v = vv.get("identificacaoVotavel")
                    cargo.votos.append(
                        VotoBU(
                            tipo=tipo,
                            votos=int(vv["quantidadeVotos"]),
                            numero=int(ident_v["codigo"]) if ident_v else None,
                            partido=int(ident_v["partido"]) if ident_v else None,
                        )
                    )
                cargos.append(cargo)
    return BoletimUrna(
        municipio=int(ident["municipioZona"]["municipio"]),
        zona=int(ident["municipioZona"]["zona"]),
        local=int(ident["local"]),
        secao=int(ident["secao"]),
        emitido_em=data_hora_je(bu.get("dataHoraEmissao")),
        eleitores_aptos=aptos,
        comparecimento=int(bu.get("qtdEleitoresCompareceram", 0)),
        cargos=cargos,
    )


CARGO_NOME = {v: k for k, v in CARGO_CONSTITUCIONAL.items()}


def codificar(
    *,
    pleito: int,
    eleicoes: list[tuple[int, int, list[tuple[int, int, list[VotoBU]]]]],
    municipio: int,
    zona: int,
    local: int,
    secao: int,
    emitido: str,
    aptos: int,
    comparecimento: int,
    fase: str = "oficial",
) -> bytes:
    """Gera um .bu válido segundo a spec (usado pelo mock do TSE e pelos testes).

    `eleicoes` = [(id_eleicao, tipo_cargo 1|2, [(cd_cargo, comparecimento, votos)])].
    """
    conv = compilador()
    ident = {"municipioZona": {"municipio": municipio, "zona": zona}, "local": local, "secao": secao}
    resultados = []
    for id_eleicao, tipo_cargo, cargos in eleicoes:
        totais = []
        for ordem, (cd_cargo, comp, votos) in enumerate(cargos, start=1):
            vv = []
            for i, v in enumerate(votos, start=1):
                item: dict = {"tipoVoto": v.tipo, "quantidadeVotos": v.votos, "ordemGeracaoHash": i, "hash": b"\x00" * 4}
                if v.numero is not None:
                    item["identificacaoVotavel"] = {"partido": v.partido or 0, "codigo": v.numero}
                vv.append(item)
            totais.append({
                "codigoCargo": ("cargoConstitucional", CARGO_NOME[cd_cargo]),
                "ordemImpressao": ordem,
                "votosVotaveis": vv,
            })
            _ = comp
        resultados.append({
            "idEleicao": id_eleicao,
            "qtdEleitoresAptos": aptos,
            "qtdEleitoresAptosSecao": aptos,
            "qtdEleitoresAptosTTE": 0,
            "resultadosVotacao": [{
                "tipoCargo": "majoritario" if tipo_cargo == 1 else "proporcional",
                "qtdComparecimento": comparecimento,
                "totaisVotosCargo": totais,
            }],
            "ultimoHashVotosVotavel": b"\x00" * 4,
            "assinaturaUltimoHashVotosVotavel": b"\x00" * 4,
        })
    cabecalho = {"dataGeracao": emitido, "idEleitoral": ("idPleito", pleito)}
    bu = {
        "cabecalho": cabecalho,
        "fase": fase,
        "urna": {
            "tipoUrna": "secao",
            "versaoVotacao": "9.99.0.0 - Mock",
            "correspondenciaResultado": {
                "identificacao": ("identificacaoSecaoEleitoral", ident),
                "carga": {
                    "numeroInternoUrna": 2_000_000 + secao,
                    "numeroSerieFC": b"\x00\x00\x00\x01",
                    "identificadorGeradorMidia": {"nome": "MOCK", "serialCertificadoTPM": "0", "serialInstalacao": "0"},
                    "dataHoraCarga": emitido,
                    "codigoCarga": "000000",
                },
            },
            "tipoArquivo": "votacaoUE",
            "numeroSerieFV": b"\x00\x00\x00\x02",
        },
        "identificacaoSecao": ident,
        "dataHoraEmissao": emitido,
        "dadosSecaoSA": ("dadosSecao", {"dataHoraAbertura": emitido[:9] + "080000", "dataHoraEncerramento": emitido[:9] + "170000"}),
        "qtdEleitoresCompareceram": comparecimento,
        "resultadosVotacaoPorEleicao": resultados,
        "historicoCodigosCarga": [],
    }
    conteudo = conv.encode("EntidadeBoletimUrna", bu)
    envelope = {
        "cabecalho": cabecalho,
        "fase": fase,
        "identificacao": ("identificacaoSecaoEleitoral", ident),
        "tipoEnvelope": "envelopeBoletimUrna",
        "conteudo": conteudo,
    }
    return conv.encode("EntidadeEnvelopeGenerico", envelope)
