"""EA18 file (section auxiliary): the ballot box files received for one section, and which one is tallied."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.infra.tse.numbers import date_time


@dataclass
class UrnFileTSE:
    hash: str
    status: str
    received_at: datetime | None
    files: list[str]

    @property
    def tallied(self) -> bool:
        return self.status.lower().startswith("totalizad")

    def ballot_box_name(self) -> str | None:
        return next((name for name in self.files if name.endswith(".bu")), None)


@dataclass
class AuxiliarySectionTSE:
    status: str
    ballot_boxes: list[UrnFileTSE]

    def ballot_box_tallied(self) -> UrnFileTSE | None:
        tallied = [u for u in self.ballot_boxes if u.tallied and u.ballot_box_name()]
        if not tallied:
            return None
        # More than one tallied urn (replacement): the most recent one is used.
        return max(tallied, key=lambda u: u.received_at.timestamp() if u.received_at else 0.0)


def parse_auxiliary(data: dict[str, Any]) -> AuxiliarySectionTSE:
    ballot_boxes = [
        UrnFileTSE(
            hash=str(entry.get("hash") or ""),
            status=str(entry.get("st") or ""),
            received_at=date_time(entry.get("dr"), entry.get("hr")),
            files=[str(name) for name in (entry.get("nmarq") or [])],
        )
        for entry in (data.get("hashes") or [])
    ]
    return AuxiliarySectionTSE(status=str(data.get("st") or ""), ballot_boxes=ballot_boxes)
