"""Conversions of the TSE formats: values arrive as strings, decimals use a comma, dates are dd/mm/yyyy."""

from datetime import UTC, datetime, timedelta, timezone

BRT = timezone(timedelta(hours=-3), "BRT")


def integer(value: object, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if not text:
        return default
    try:
        return int(float(text.replace(",", ".")))
    except ValueError:
        return default


def integer_or_none(value: object) -> int | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return integer(value)


def decimal(value: object, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, int | float):
        return float(value)
    text = str(value).strip()
    if not text:
        return default
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return default


def date_time(date: object, time: object) -> datetime | None:
    """'04/10/2026' + '19:42:10' (Brasilia time) -> UTC datetime."""
    if not date:
        return None
    day = str(date).strip()
    clock = str(time).strip() if time else "00:00:00"
    try:
        local = datetime.strptime(f"{day} {clock}", "%d/%m/%Y %H:%M:%S")
    except ValueError:
        try:
            local = datetime.strptime(f"{day} {clock}", "%d/%m/%Y %H:%M")
        except ValueError:
            return None
    return local.replace(tzinfo=BRT).astimezone(UTC)


def date_time_je(value: object) -> datetime | None:
    """Ballot box format: YYYYMMDDThhmmss (Brasilia time)."""
    if not value:
        return None
    try:
        local = datetime.strptime(str(value), "%Y%m%dT%H%M%S")
    except ValueError:
        return None
    return local.replace(tzinfo=BRT).astimezone(UTC)


def format_date(moment: datetime) -> tuple[str, str]:
    local = moment.astimezone(BRT)
    return local.strftime("%d/%m/%Y"), local.strftime("%H:%M:%S")


def yes_no(value: object) -> bool:
    return str(value or "").strip().lower() in {"s", "sim", "true", "1", "e"}
