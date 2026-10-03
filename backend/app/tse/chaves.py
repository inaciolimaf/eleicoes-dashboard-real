"""Chaves públicas de verificação JWS, uma por ambiente.

Fonte: "Manual de verificação dos arquivos JWS" do TSE (Apêndice A = desenvolvimento/simulado, Apêndice B = oficial),
transcritas de projeto de terceiros que validou a de simulado contra arquivos reais. CONFIRMAR no manual oficial.
O ambiente "fake" (mock local) usa a chave configurada em TSE_FAKE_CHAVE_PUBLICA ou a chave determinística do mock.
"""

from app.core.config import get_settings
from app.tse.jws import ChaveJWS

CHAVES: dict[str, ChaveJWS] = {
    "simulado": ChaveJWS(kid="pEGrlis0i8vO2Bz7Ergwr0MnKfg", x="81fm_gXW6Q5gBWrGJkE7j5MOS5vmTnRqqFHfdMeRbsw"),
    "oficial": ChaveJWS(kid="sNbt9Q_fLS65zE1_ZLNV-XRRwPY", x="kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc"),
}


def chave_do_ambiente(ambiente: str) -> ChaveJWS:
    if ambiente == "fake":
        s = get_settings()
        x = s.tse_fake_chave_publica
        if not x:
            from tse_fake.chave import chave_publica_fake

            x = chave_publica_fake()
        return ChaveJWS(kid=s.tse_fake_kid, x=x)
    return CHAVES[ambiente]
