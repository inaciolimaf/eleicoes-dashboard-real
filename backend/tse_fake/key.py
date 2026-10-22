"""Deterministic Ed25519 key of the mock (for development and tests only; it is NOT a secret)."""

import hashlib
from functools import lru_cache

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.infra.tse.jws import public_key_x

SEED = b"eleicoes-dashboard-real/tse-fake/2026"


@lru_cache
def private_key_fake() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(hashlib.sha256(SEED).digest())


def public_key_fake() -> str:
    return public_key_x(private_key_fake())
