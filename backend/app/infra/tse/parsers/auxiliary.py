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
    #: Name of the ballot box report (BU) among `files`, or None when the urn has none.
    ballot_box: str | None = None

    @property
    def tallied(self) -> bool:
        return self.status.lower().startswith("totalizad")

    def ballot_box_name(self) -> str | None:
        return self.ballot_box


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


def _urn_files(entry: dict[str, Any]) -> tuple[list[str], str | None]:
    """File names of one urn and which one is the BU.

    2026 lists `arq: [{"nm": "o03220ap0605000020069-bu.dat", "tp": "bu"}, ...]`; 2022 listed
    `nmarq: ["o00406-0605000020824.bu", ...]`. Both are read, so a fallback to the old layout is harmless.
    """
    typed = [(str(a["nm"]), str(a.get("tp") or "")) for a in (entry.get("arq") or []) if a.get("nm")]
    names = [name for name, _ in typed] + [str(name) for name in (entry.get("nmarq") or [])]
    ballot_box = next((name for name, kind in typed if kind == "bu"), None) or next(
        (name for name in names if name.endswith((".bu", "-bu.dat"))), None
    )
    return names, ballot_box


def parse_auxiliary(data: dict[str, Any]) -> AuxiliarySectionTSE:
    ballot_boxes = []
    for entry in data.get("hashes") or []:
        files, ballot_box = _urn_files(entry)
        ballot_boxes.append(
            UrnFileTSE(
                hash=str(entry.get("hash") or ""),
                status=str(entry.get("st") or ""),
                received_at=date_time(entry.get("dr"), entry.get("hr")),
                files=files,
                ballot_box=ballot_box,
            )
        )
    return AuxiliarySectionTSE(status=str(data.get("st") or ""), ballot_boxes=ballot_boxes)
