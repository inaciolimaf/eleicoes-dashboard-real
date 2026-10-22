"""JWS signature (Ed25519) and ballot box report (ASN.1)."""

import json

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.infra.tse import jws
from app.infra.tse.ballot_box import BallotBoxSpec, BallotVote, decode, encode
from app.infra.tse.keys import key_for_environment
from tse_fake.key import private_key_fake


@pytest.fixture
def key_pair():
    private = Ed25519PrivateKey.generate()
    return private, jws.JwsKey(kid="teste", x=jws.public_key_x(private))


def test_jws_valido(key_pair):
    private, key = key_pair
    token = jws.sign(b'{"ok": true}', private, "teste")
    assert json.loads(jws.verify(token, key)) == {"ok": True}
    header, payload = jws.decode_unverified(token)
    assert header == {"kid": "teste", "typ": "JOSE", "alg": "EdDSA"} and payload == b'{"ok": true}'


def test_jws_um_byte_alterado_e_rejeitado(key_pair):
    private, key = key_pair
    h, _p, s = jws.sign(b'{"votos": 100}', private, "teste").split(".")
    tampered = jws.b64url_encode(b'{"votos": 900}')
    with pytest.raises(jws.JwsError, match="assinatura"):
        jws.verify(f"{h}.{tampered}.{s}", key)


def test_jws_kid_e_algoritmo_errados(key_pair):
    private, key = key_pair
    with pytest.raises(jws.JwsError, match="kid"):
        jws.verify(jws.sign(b"{}", private, "outro"), key)
    header = jws.b64url_encode(json.dumps({"kid": "teste", "alg": "HS256"}).encode())
    with pytest.raises(jws.JwsError, match="algoritmo"):
        jws.verify(f"{header}.e30.AAAA", key)
    with pytest.raises(jws.JwsError):
        jws.verify("apenas.duas", key)


def test_chave_do_mock_confere_com_ambiente_fake():
    token = jws.sign(b"{}", private_key_fake(), key_for_environment("fake").kid)
    assert jws.verify(token, key_for_environment("fake")) == b"{}"
    assert key_for_environment("oficial").kid == "sNbt9Q_fLS65zE1_ZLNV-XRRwPY"
    with pytest.raises(jws.JwsError):
        jws.verify(token, key_for_environment("simulado"))


def test_boletim_de_urna_ida_e_volta():
    votes_president = [
        BallotVote("nominal", 130, 13, 13),
        BallotVote("nominal", 100, 22, 22),
        BallotVote("branco", 5),
        BallotVote("nulo", 15),
    ]
    votes_deputy = [
        BallotVote("nominal", 30, 1301, 13),
        BallotVote("legenda", 10, 13, 13),
        BallotVote("nulo", 210),
    ]
    raw = encode(
        BallotBoxSpec(
            event=9001,
            elections=[(9100, 1, [(1, 250, votes_president)]), (9102, 2, [(6, 250, votes_deputy)])],
            municipality=71072,
            zone=1,
            place=1015,
            section=120,
            issued="20261004T171523",
            eligible=320,
            turnout=250,
        )
    )
    bu = decode(raw)
    assert (bu.municipality, bu.zone, bu.polling_place, bu.section) == (71072, 1, 1015, 120)
    assert bu.eligible_voters == 320 and bu.turnout == 250
    pres, dep = bu.offices
    assert pres.office_code == 1 and pres.validos == 230 and pres.blank_votes == 5 and pres.null_votes == 15
    assert dep.office_code == 6 and dep.validos == 40
    assert [v.tipo for v in dep.votes] == ["nominal", "legenda", "nulo"]
    assert bu.issued_at.isoformat() == "2026-10-04T20:15:23+00:00"
