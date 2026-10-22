"""Drawing helpers shared by the vote generators: names, numbers, parties and vote distribution."""

from __future__ import annotations

import hashlib

import numpy as np

from tse_fake.data import FEDERATION_NUMBERS, FIRST_NAMES, NICKNAMES, PARTIES, SURNAMES
from tse_fake.scenario.model import Candidate, Party


def make_name(rng: np.random.Generator, used: set[str]) -> tuple[str, str]:
    """Full name and ballot name; the ballot name is unique among `used`."""
    for _ in range(100):
        first = str(rng.choice(FIRST_NAMES))
        surname1, surname2 = (str(x) for x in rng.choice(SURNAMES, 2, replace=False))
        name = f"{first} {surname1} {surname2}"
        ballot = f"{first} {rng.choice(NICKNAMES)}" if rng.random() < 0.25 else f"{first} {surname2}"
        if ballot not in used:
            used.add(ballot)
            return name, ballot
    return name, f"{ballot} {len(used)}"


def tse_candidate_id(seed: int, office_code: int, state_code: str, index: int) -> str:
    """Stable 'sqcand'-like id: the same inputs always give the same id."""
    digest = hashlib.sha1(f"{seed}:{office_code}:{state_code}:{index}".encode(), usedforsecurity=False)
    value = int(digest.hexdigest()[:8], 16)
    return str(280000000000 + value % 100000000)


def make_parties() -> list[Party]:
    parties: list[Party] = []
    for number, acronym, name, federation in PARTIES:
        if federation:
            parties.append(Party(number, acronym, name, federation, FEDERATION_NUMBERS[federation], "f"))
        else:
            parties.append(Party(number, acronym, name, name, str(number), "i"))
    return parties


def unique_numbers(candidates: list[Candidate], util: np.ndarray) -> tuple[list[Candidate], np.ndarray]:
    """Keeps the first candidate of each ballot number (the utility columns follow)."""
    seen: set[int] = set()
    keep: list[int] = []
    for i, candidate in enumerate(candidates):
        if candidate.ballot_number not in seen:
            seen.add(candidate.ballot_number)
            keep.append(i)
    return [candidates[i] for i in keep], util[:, keep]


def spatial_field(
    rng: np.random.Generator, lat: np.ndarray, lon: np.ndarray, centers: int, scale: float
) -> np.ndarray:
    """Smooth spatial field (sum of gaussians) that gives regional strongholds."""
    field = np.zeros_like(lat)
    for _ in range(centers):
        k = int(rng.integers(0, len(lat)))
        cy, cx = lat[k], lon[k]
        sigma = float(rng.uniform(1.0, 4.0)) * scale
        amplitude = float(rng.normal(0, 0.8))
        field += amplitude * np.exp(-(((lat - cy) ** 2 + (lon - cx) ** 2) / (2 * sigma**2)))
    return field


def distribute(rng: np.random.Generator, util: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Splits each section's valid votes among the candidates with a softmax of their utilities."""
    prob = np.exp(util - util.max(axis=1, keepdims=True))
    prob /= prob.sum(axis=1, keepdims=True)
    return rng.multinomial(valid.astype(np.int64), prob).astype(np.int32)


def blank_and_null(
    rng: np.random.Generator, turnout: np.ndarray, p_blank: float, p_null: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Blank votes, null votes and the valid rest of the turnout of each section."""
    blank = rng.binomial(turnout, p_blank).astype(np.int32)
    null = rng.binomial(turnout - blank, p_null).astype(np.int32)
    return blank, null, (turnout - blank - null).astype(np.int32)
