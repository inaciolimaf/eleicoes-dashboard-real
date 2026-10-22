"""EA18 file (auxiliar de seção): the ballot box files received for one section, and which one is tallied."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.infra.tse.numbers import date_time


@dataclass
class UrnFileTSE:
    hash: str
    status: str
    recebido_em: datetime | None
    arquivos: list[str]

    @property
    def tallied(self) -> bool:
        return self.status.lower().startswith("totalizad")

    def nome_bu(self) -> str | None:
        return next((name for name in self.arquivos if name.endswith(".bu")), None)


@dataclass
class AuxiliarySectionTSE:
    status: str
    urnas: list[UrnFileTSE]

    def urna_totalizada(self) -> UrnFileTSE | None:
        tallied = [u for u in self.urnas if u.tallied and u.nome_bu()]
        if not tallied:
            return None
        # More than one tallied urn (replacement): the most recent one is used.
        return max(tallied, key=lambda u: u.recebido_em.timestamp() if u.recebido_em else 0.0)


def parse_auxiliary(data: dict[str, Any]) -> AuxiliarySectionTSE:
    urnas = [
        UrnFileTSE(
            hash=str(entry.get("hash") or ""),
            status=str(entry.get("st") or ""),
            recebido_em=date_time(entry.get("dr"), entry.get("hr")),
            arquivos=[str(name) for name in (entry.get("nmarq") or [])],
        )
        for entry in (data.get("hashes") or [])
    ]
    return AuxiliarySectionTSE(status=str(data.get("st") or ""), urnas=urnas)
