"""Processing of the collected files: writes to the database, detects events and publishes in real time.

Each message is one unit of work: everything is written, or nothing. The realtime messages go out
only after the commit. One module per job type: result, tracking, ballot_box, publishing, diagnostics.
"""

from app.worker.jobs.processor import Processor

__all__ = ["Processor"]
