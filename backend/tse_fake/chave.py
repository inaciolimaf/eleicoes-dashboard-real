"""Chave Ed25519 determinística do mock (apenas para desenvolvimento/testes — NÃO é segredo)."""

import hashlib
from functools import lru_cache

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.tse.jws import chave_publica_x

SEMENTE = b"eleicoes-dashboard-real/tse-fake/2026"


@lru_cache
def chave_privada_fake() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(hashlib.sha256(SEMENTE).digest())


def chave_publica_fake() -> str:
    return chave_publica_x(chave_privada_fake())
