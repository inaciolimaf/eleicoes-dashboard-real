"""Events feed: detection of relevant changes in the tally."""

from app.modules.events import detection
from app.modules.events.models import Evento

__all__ = ["Evento", "detection"]
