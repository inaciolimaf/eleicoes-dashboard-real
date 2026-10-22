"""Verification of the JWS files (compact serialization, EdDSA/Ed25519) published by the TSE in 2026.

The public key is fixed per environment and is NEVER read from inside the JWS itself.
"""

import base64
import json
from dataclasses import dataclass
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey


class JwsError(Exception):
    pass


def b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@dataclass
class JwsKey:
    kid: str
    x: str  # Ed25519 public key in base64url

    def public_key(self) -> Ed25519PublicKey:
        return Ed25519PublicKey.from_public_bytes(b64url_decode(self.x))


def decode_unverified(token: str) -> tuple[dict[str, Any], bytes]:
    parts = token.strip().split(".")
    if len(parts) != 3:
        raise JwsError("JWS compacto deve ter 3 partes")
    header: dict[str, Any] = json.loads(b64url_decode(parts[0]))
    return header, b64url_decode(parts[1])


def verify(token: str, key: JwsKey, algorithms: tuple[str, ...] = ("EdDSA",)) -> bytes:
    """Checks the signature, the algorithm and the kid. Returns the payload (the JSON bytes)."""
    parts = token.strip().split(".")
    if len(parts) != 3:
        raise JwsError("JWS compacto deve ter 3 partes")
    try:
        header: dict[str, Any] = json.loads(b64url_decode(parts[0]))
    except (ValueError, json.JSONDecodeError) as exc:
        raise JwsError("header inválido") from exc
    if header.get("alg") not in algorithms:
        raise JwsError(f"algoritmo não permitido: {header.get('alg')}")
    if header.get("kid") != key.kid:
        raise JwsError(f"kid inesperado: {header.get('kid')}")
    signed = f"{parts[0]}.{parts[1]}".encode()
    try:
        key.public_key().verify(b64url_decode(parts[2]), signed)
    except (InvalidSignature, ValueError) as exc:
        raise JwsError("assinatura inválida") from exc
    return b64url_decode(parts[1])


def sign(payload: bytes, private_key: Ed25519PrivateKey, kid: str) -> str:
    """Used by the TSE mock and by the tests."""
    header = b64url_encode(
        json.dumps({"kid": kid, "typ": "JOSE", "alg": "EdDSA"}, separators=(",", ":")).encode()
    )
    body = b64url_encode(payload)
    signature = private_key.sign(f"{header}.{body}".encode())
    return f"{header}.{body}.{b64url_encode(signature)}"


def public_key_x(private_key: Ed25519PrivateKey) -> str:
    raw = private_key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return b64url_encode(raw)


# Names used before the English rename; other slices still import them.
ErroJWS = JwsError
ChaveJWS = JwsKey
decodificar_sem_verificar = decode_unverified
verificar = verify
assinar = sign
chave_publica_x = public_key_x
