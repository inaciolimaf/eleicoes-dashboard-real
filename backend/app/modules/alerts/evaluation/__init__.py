"""Alert evaluation: which enabled alerts a tally or a polling place completion fires.

The worker calls it after each tally; `rules` holds the conditions, `cache` the list of live alerts,
`triggers` the write that marks an alert as fired.
"""

from app.modules.alerts.evaluation.cache import active_alerts, invalidate_cache
from app.modules.alerts.evaluation.rules import evaluate_polling_place, evaluate_result
from app.modules.alerts.evaluation.triggers import mark_triggered

__all__ = [
    "active_alerts",
    "evaluate_polling_place",
    "evaluate_result",
    "invalidate_cache",
    "mark_triggered",
]

# TEMPORARY: removed by the main agent after integration. The collector, the worker and the
# integration tests of other slices still call the old names of this module.
ativos = active_alerts
invalidar_cache = invalidate_cache
avaliar_resultado = evaluate_result
avaliar_local = evaluate_polling_place
marcar_disparado = mark_triggered
