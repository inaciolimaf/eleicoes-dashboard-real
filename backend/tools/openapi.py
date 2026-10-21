"""Writes the backend OpenAPI to `openapi.json`: `frontend/src/api/types.ts` is generated from it.

Usage:

    uv run python -m tools.openapi
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

#: The Python project root (`backend/`).
PROJECT_ROOT = Path(__file__).resolve().parent.parent
#: The repository root: the frontend imports the generated types from there.
ROOT = PROJECT_ROOT.parent


def main() -> int:
    # Placeholder values only so the settings load; the variable names are the ones the server has.
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:x@localhost/x")
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
    os.environ.setdefault("JWT_SECRET", "x" * 32)
    from app.main import criar_app

    target = ROOT / "openapi.json"
    target.write_text(
        json.dumps(criar_app().openapi(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"{target.relative_to(ROOT)} written", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
