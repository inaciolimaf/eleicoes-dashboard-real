"""Ballot box report (BU): ASN.1/BER decoding following the specification the TSE publishes (bu.asn1).

The `.bu` file is an EntidadeEnvelopeGenerico whose `conteudo` is an EntidadeBoletimUrna.
"""

from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import asn1tools

from app.infra.tse.numbers import date_time_je

SPEC = Path(__file__).parent / "asn1" / "bu.asn1"

VOTE_TYPES = {1: "nominal", 2: "branco", 3: "nulo", 4: "legenda", 5: "cargoSemCandidato"}
CONSTITUTIONAL_OFFICE_CODES = {
    "presidente": 1,
    "governador": 3,
    "senador": 5,
    "deputadoFederal": 6,
    "deputadoEstadual": 7,
    "deputadoDistrital": 8,
    "prefeito": 11,
    "vereador": 13,
}
OFFICE_NAME_BY_CODE = {code: name for name, code in CONSTITUTIONAL_OFFICE_CODES.items()}


@lru_cache
def compiler() -> asn1tools.compiler.Specification:
    return asn1tools.compile_files([str(SPEC)], codec="ber", numeric_enums=False)


@dataclass
class BallotVote:
    kind: str  # nominal | branco | nulo | legenda
    votes: int
    number: int | None = None
    party: int | None = None


@dataclass
class BallotOffice:
    office_code: int
    turnout: int
    votes: list[BallotVote] = field(default_factory=list)

    @property
    def validos(self) -> int:
        return sum(v.votes for v in self.votes if v.kind in ("nominal", "legenda"))

    @property
    def blank_votes(self) -> int:
        return sum(v.votes for v in self.votes if v.kind == "branco")

    @property
    def null_votes(self) -> int:
        return sum(v.votes for v in self.votes if v.kind == "nulo")


@dataclass
class DecodedBallotBox:
    municipality: int
    zone: int
    polling_place: int
    section: int
    issued_at: datetime | None
    eligible_voters: int
    turnout: int
    offices: list[BallotOffice]


def _office_code(choice: tuple[str, Any]) -> int:
    kind, value = choice
    if kind == "cargoConstitucional":
        return CONSTITUTIONAL_OFFICE_CODES.get(value, 0) if isinstance(value, str) else int(value)
    return int(value)


def _read_vote(entry: dict[str, Any]) -> BallotVote:
    kind = entry["tipoVoto"]
    kind = VOTE_TYPES.get(kind, str(kind)) if isinstance(kind, int) else kind
    votable = entry.get("identificacaoVotavel")
    return BallotVote(
        kind=kind,
        votes=int(entry["quantidadeVotos"]),
        number=int(votable["codigo"]) if votable else None,
        party=int(votable["partido"]) if votable else None,
    )


def _read_offices(bu: dict[str, Any]) -> tuple[int, list[BallotOffice]]:
    """Returns the largest number of eligible voters seen and the offices with their votes."""
    eligible = 0
    offices: list[BallotOffice] = []
    for by_election in bu["resultadosVotacaoPorEleicao"]:
        eligible = max(eligible, int(by_election["qtdEleitoresAptos"]))
        for result in by_election["resultadosVotacao"]:
            turnout = int(result["qtdComparecimento"])
            for total in result["totaisVotosCargo"]:
                office = BallotOffice(office_code=_office_code(total["codigoCargo"]), turnout=turnout)
                office.votes = [_read_vote(vv) for vv in total["votosVotaveis"]]
                offices.append(office)
    return eligible, offices


def decode(content: bytes) -> DecodedBallotBox:
    conv = compiler()
    envelope = conv.decode("EntidadeEnvelopeGenerico", content)
    bu = conv.decode("EntidadeBoletimUrna", envelope["conteudo"])
    ident = bu["identificacaoSecao"]
    eligible, offices = _read_offices(bu)
    return DecodedBallotBox(
        municipality=int(ident["municipioZona"]["municipio"]),
        zone=int(ident["municipioZona"]["zona"]),
        polling_place=int(ident["local"]),
        section=int(ident["secao"]),
        issued_at=date_time_je(bu.get("dataHoraEmissao")),
        eligible_voters=eligible,
        turnout=int(bu.get("qtdEleitoresCompareceram", 0)),
        offices=offices,
    )


@dataclass(frozen=True)
class BallotBoxSpec:
    """Content of a ballot box report to encode.

    `elections` = [(election_id, 1 majoritarian | 2 proportional, [(office_code, turnout, votes)])].
    """

    event: int
    elections: list[tuple[int, int, list[tuple[int, int, list[BallotVote]]]]]
    municipality: int
    zone: int
    place: int
    section: int
    issued: str
    eligible: int
    turnout: int
    phase: str = "oficial"


def _votable_items(votes: list[BallotVote]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for position, vote in enumerate(votes, start=1):
        item: dict[str, Any] = {
            "tipoVoto": vote.kind,
            "quantidadeVotos": vote.votes,
            "ordemGeracaoHash": position,
            "hash": b"\x00" * 4,
        }
        if vote.number is not None:
            item["identificacaoVotavel"] = {"partido": vote.party or 0, "codigo": vote.number}
        items.append(item)
    return items


def _office_totals(offices: list[tuple[int, int, list[BallotVote]]]) -> list[dict[str, Any]]:
    return [
        {
            "codigoCargo": ("cargoConstitucional", OFFICE_NAME_BY_CODE[code]),
            "ordemImpressao": position,
            "votosVotaveis": _votable_items(votes),
        }
        for position, (code, _turnout, votes) in enumerate(offices, start=1)
    ]


def _election_results(spec: BallotBoxSpec) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for election_id, kind, offices in spec.elections:
        results.append(
            {
                "idEleicao": election_id,
                "qtdEleitoresAptos": spec.eligible,
                "qtdEleitoresAptosSecao": spec.eligible,
                "qtdEleitoresAptosTTE": 0,
                "resultadosVotacao": [
                    {
                        "tipoCargo": "majoritario" if kind == 1 else "proporcional",
                        "qtdComparecimento": spec.turnout,
                        "totaisVotosCargo": _office_totals(offices),
                    }
                ],
                "ultimoHashVotosVotavel": b"\x00" * 4,
                "assinaturaUltimoHashVotosVotavel": b"\x00" * 4,
            }
        )
    return results


def _ballot_box_block(spec: BallotBoxSpec, ident: dict[str, Any]) -> dict[str, Any]:
    return {
        "tipoUrna": "secao",
        "versaoVotacao": "9.99.0.0 - Mock",
        "correspondenciaResultado": {
            "identificacao": ("identificacaoSecaoEleitoral", ident),
            "carga": {
                "numeroInternoUrna": 2_000_000 + spec.section,
                "numeroSerieFC": b"\x00\x00\x00\x01",
                "identificadorGeradorMidia": {
                    "nome": "MOCK",
                    "serialCertificadoTPM": "0",
                    "serialInstalacao": "0",
                },
                "dataHoraCarga": spec.issued,
                "codigoCarga": "000000",
            },
        },
        "tipoArquivo": "votacaoUE",
        "numeroSerieFV": b"\x00\x00\x00\x02",
    }


def _report_body(spec: BallotBoxSpec, ident: dict[str, Any], header: dict[str, Any]) -> dict[str, Any]:
    return {
        "cabecalho": header,
        "fase": spec.phase,
        "urna": _ballot_box_block(spec, ident),
        "identificacaoSecao": ident,
        "dataHoraEmissao": spec.issued,
        "dadosSecaoSA": (
            "dadosSecao",
            {
                "dataHoraAbertura": spec.issued[:9] + "080000",
                "dataHoraEncerramento": spec.issued[:9] + "170000",
            },
        ),
        "qtdEleitoresCompareceram": spec.turnout,
        "resultadosVotacaoPorEleicao": _election_results(spec),
        "historicoCodigosCarga": [],
    }


def encode(spec: BallotBoxSpec) -> bytes:
    """Generates a valid .bu according to the spec (used by the TSE mock and by the tests)."""
    conv = compiler()
    ident = {
        "municipioZona": {"municipio": spec.municipality, "zona": spec.zone},
        "local": spec.place,
        "secao": spec.section,
    }
    header = {"dataGeracao": spec.issued, "idEleitoral": ("idPleito", spec.event)}
    content = conv.encode("EntidadeBoletimUrna", _report_body(spec, ident, header))
    envelope = {
        "cabecalho": header,
        "fase": spec.phase,
        "identificacao": ("identificacaoSecaoEleitoral", ident),
        "tipoEnvelope": "envelopeBoletimUrna",
        "conteudo": content,
    }
    encoded: bytes = conv.encode("EntidadeEnvelopeGenerico", envelope)
    return encoded


# Names used before the English rename; other slices still import them.
