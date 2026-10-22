"""On-demand section requests (`registry`): what the API registers and what the collector reads."""

from app.modules.ballot_reports.demand.registry import DEMAND_KEY, LEVELS, pending, register

__all__ = ["DEMAND_KEY", "LEVELS", "pending", "register"]
