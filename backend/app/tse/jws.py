"""Verificação dos arquivos JWS (compact serialization, EdDSA/Ed25519) publicados pelo TSE em 2026.

A chave pública é fixa por ambiente e NUNCA é lida de dentro do próprio JWS.
"""

import base64
import json
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey


class ErroJWS(Exception):
    pass


def b64url_decode(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def b64url_encode(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode()


@dataclass
class ChaveJWS:
    kid: str
    x: str  # chave pública Ed25519 em base64url

    def publica(self) -> Ed25519PublicKey:
        return Ed25519PublicKey.from_public_bytes(b64url_decode(self.x))


def decodificar_sem_verificar(token: str) -> tuple[dict, bytes]:
    partes = token.strip().split(".")
    if len(partes) != 3:
        raise ErroJWS("JWS compacto deve ter 3 partes")
    header = json.loads(b64url_decode(partes[0]))
    return header, b64url_decode(partes[1])


def verificar(token: str, chave: ChaveJWS, algoritmos: tuple[str, ...] = ("EdDSA",)) -> bytes:
    """Verifica assinatura, algoritmo e kid. Devolve o payload (bytes do JSON)."""
    partes = token.strip().split(".")
    if len(partes) != 3:
        raise ErroJWS("JWS compacto deve ter 3 partes")
    try:
        header = json.loads(b64url_decode(partes[0]))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ErroJWS("header inválido") from exc
    if header.get("alg") not in algoritmos:
        raise ErroJWS(f"algoritmo não permitido: {header.get('alg')}")
    if header.get("kid") != chave.kid:
        raise ErroJWS(f"kid inesperado: {header.get('kid')}")
    assinado = f"{partes[0]}.{partes[1]}".encode()
    try:
        chave.publica().verify(b64url_decode(partes[2]), assinado)
    except (InvalidSignature, ValueError) as exc:
        raise ErroJWS("assinatura inválida") from exc
    return b64url_decode(partes[1])


def assinar(payload: bytes, chave_privada: Ed25519PrivateKey, kid: str) -> str:
    """Usado pelo mock do TSE e nos testes."""
    header = b64url_encode(json.dumps({"kid": kid, "typ": "JOSE", "alg": "EdDSA"}, separators=(",", ":")).encode())
    corpo = b64url_encode(payload)
    assinatura = chave_privada.sign(f"{header}.{corpo}".encode())
    return f"{header}.{corpo}.{b64url_encode(assinatura)}"


def chave_publica_x(chave_privada: Ed25519PrivateKey) -> str:
    from cryptography.hazmat.primitives import serialization

    bruto = chave_privada.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return b64url_encode(bruto)
