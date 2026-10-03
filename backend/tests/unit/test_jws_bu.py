"""Assinatura JWS (Ed25519) e boletim de urna (ASN.1)."""

import json

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.tse import jws
from app.tse.bu import VotoBU, codificar, decodificar
from app.tse.chaves import chave_do_ambiente
from tse_fake.chave import chave_privada_fake


@pytest.fixture
def par_chaves():
    priv = Ed25519PrivateKey.generate()
    return priv, jws.ChaveJWS(kid="teste", x=jws.chave_publica_x(priv))


def test_jws_valido(par_chaves):
    priv, chave = par_chaves
    token = jws.assinar(b'{"ok": true}', priv, "teste")
    assert json.loads(jws.verificar(token, chave)) == {"ok": True}
    header, payload = jws.decodificar_sem_verificar(token)
    assert header == {"kid": "teste", "typ": "JOSE", "alg": "EdDSA"} and payload == b'{"ok": true}'


def test_jws_um_byte_alterado_e_rejeitado(par_chaves):
    priv, chave = par_chaves
    h, p, s = jws.assinar(b'{"votos": 100}', priv, "teste").split(".")
    adulterado = jws.b64url_encode(b'{"votos": 900}')
    with pytest.raises(jws.ErroJWS, match="assinatura"):
        jws.verificar(f"{h}.{adulterado}.{s}", chave)


def test_jws_kid_e_algoritmo_errados(par_chaves):
    priv, chave = par_chaves
    with pytest.raises(jws.ErroJWS, match="kid"):
        jws.verificar(jws.assinar(b"{}", priv, "outro"), chave)
    header = jws.b64url_encode(json.dumps({"kid": "teste", "alg": "HS256"}).encode())
    with pytest.raises(jws.ErroJWS, match="algoritmo"):
        jws.verificar(f"{header}.e30.AAAA", chave)
    with pytest.raises(jws.ErroJWS):
        jws.verificar("apenas.duas", chave)


def test_chave_do_mock_confere_com_ambiente_fake():
    token = jws.assinar(b"{}", chave_privada_fake(), chave_do_ambiente("fake").kid)
    assert jws.verificar(token, chave_do_ambiente("fake")) == b"{}"
    assert chave_do_ambiente("oficial").kid == "sNbt9Q_fLS65zE1_ZLNV-XRRwPY"
    with pytest.raises(jws.ErroJWS):
        jws.verificar(token, chave_do_ambiente("simulado"))


def test_boletim_de_urna_ida_e_volta():
    votos_pres = [VotoBU("nominal", 130, 13, 13), VotoBU("nominal", 100, 22, 22), VotoBU("branco", 5), VotoBU("nulo", 15)]
    votos_dep = [VotoBU("nominal", 30, 1301, 13), VotoBU("legenda", 10, 13, 13), VotoBU("nulo", 210)]
    bruto = codificar(pleito=9001, eleicoes=[(9100, 1, [(1, 250, votos_pres)]), (9102, 2, [(6, 250, votos_dep)])],
                      municipio=71072, zona=1, local=1015, secao=120, emitido="20261004T171523", aptos=320,
                      comparecimento=250)
    bu = decodificar(bruto)
    assert (bu.municipio, bu.zona, bu.local, bu.secao) == (71072, 1, 1015, 120)
    assert bu.eleitores_aptos == 320 and bu.comparecimento == 250
    pres, dep = bu.cargos
    assert pres.cd_cargo == 1 and pres.validos == 230 and pres.brancos == 5 and pres.nulos == 15
    assert dep.cd_cargo == 6 and dep.validos == 40
    assert [v.tipo for v in dep.votos] == ["nominal", "legenda", "nulo"]
    assert bu.emitido_em.isoformat() == "2026-10-04T20:15:23+00:00"
