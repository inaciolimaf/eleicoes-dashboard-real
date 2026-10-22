"""Old module path, kept for tests/integration/test_fluxo_completo.py (it imports `Divulgacao` from here).

Remove this file when that test imports `tse_fake.publication` directly.
"""

from tse_fake.publication import Publication as Divulgacao

__all__ = ["Divulgacao"]
