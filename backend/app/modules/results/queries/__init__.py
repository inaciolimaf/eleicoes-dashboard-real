"""Read queries: build the payloads of the API (the DTOs in `schemas.py` describe each one).

The API keys are in English (glossary). The status and level values come from the database; the
product text (titles, `Válido`, office names) stays in Portuguese.

The names exported here are the ones the public API and the worker call, through
`from app.modules.results import queries`.
"""

from app.modules.results.queries.candidates import candidate_detail, list_candidates
from app.modules.results.queries.children.query import child_item, children
from app.modules.results.queries.common import geo_area_name, iso
from app.modules.results.queries.events import EventsQuery, event_json, list_events, timeline
from app.modules.results.queries.polling.maps import MapQuery, polling_place_map
from app.modules.results.queries.polling.place import polling_place_detail, polling_place_item
from app.modules.results.queries.search import search_items
from app.modules.results.queries.sections import section_detail
from app.modules.results.queries.status import last_tally, list_elections, pct_country, progress
from app.modules.results.queries.tally.lines import tse_line
from app.modules.results.queries.tally.result import build_result
from app.modules.results.queries.tally.series import series

__all__ = [
    "EventsQuery",
    "MapQuery",
    "build_result",
    "candidate_detail",
    "child_item",
    "children",
    "event_json",
    "geo_area_name",
    "iso",
    "last_tally",
    "list_candidates",
    "list_elections",
    "list_events",
    "pct_country",
    "polling_place_detail",
    "polling_place_item",
    "polling_place_map",
    "progress",
    "search_items",
    "section_detail",
    "series",
    "timeline",
    "tse_line",
]
