"""Public keys that verify the JWS files, one per environment.

Source: the TSE "Manual de verificação dos arquivos JWS" (Appendix A = development/simulated, Appendix B =
official), transcribed from a third-party project that validated the simulated key against real files.
CONFIRM against the official manual. The "fake" environment (local mock) uses the key set in
TSE_FAKE_CHAVE_PUBLICA or the deterministic key of the mock.
"""

from app.core.config import get_settings
from app.infra.tse.jws import JwsKey

KEYS: dict[str, JwsKey] = {
    "simulado": JwsKey(kid="pEGrlis0i8vO2Bz7Ergwr0MnKfg", x="81fm_gXW6Q5gBWrGJkE7j5MOS5vmTnRqqFHfdMeRbsw"),
    "oficial": JwsKey(kid="sNbt9Q_fLS65zE1_ZLNV-XRRwPY", x="kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc"),
}


def key_for_environment(environment: str) -> JwsKey:
    if environment == "fake":
        settings = get_settings()
        public_x = settings.tse_fake_chave_publica
        if not public_x:
            from tse_fake.key import public_key_fake

            public_x = public_key_fake()
        return JwsKey(kid=settings.tse_fake_kid, x=public_x)
    return KEYS[environment]


# Name used before the English rename; the collector still imports it.
chave_do_ambiente = key_for_environment
