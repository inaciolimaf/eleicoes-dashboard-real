"""Old module path, kept for tests/integration/test_fluxo_completo.py (it imports `Cenario` from here).

Remove this file when that test imports `tse_fake.scenario` directly.
"""

from tse_fake.scenario import Scenario as Cenario

__all__ = ["Cenario"]
