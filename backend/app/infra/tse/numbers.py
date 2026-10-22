"""Conversões dos formatos do TSE (tudo vem como string, decimal com vírgula, data dd/mm/aaaa)."""

from datetime import UTC, datetime, timedelta, timezone

BRT = timezone(timedelta(hours=-3), "BRT")


def inteiro(valor: object, padrao: int = 0) -> int:
    if valor is None:
        return padrao
    if isinstance(valor, bool):
        return int(valor)
    if isinstance(valor, int):
        return valor
    texto = str(valor).strip()
    if not texto:
        return padrao
    try:
        return int(float(texto.replace(",", ".")))
    except ValueError:
        return padrao


def inteiro_ou_none(valor: object) -> int | None:
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None
    return inteiro(valor)


def decimal(valor: object, padrao: float = 0.0) -> float:
    if valor is None:
        return padrao
    if isinstance(valor, int | float):
        return float(valor)
    texto = str(valor).strip()
    if not texto:
        return padrao
    try:
        return float(texto.replace(",", "."))
    except ValueError:
        return padrao


def data_hora(data: object, hora: object) -> datetime | None:
    """'04/10/2026' + '19:42:10' (horário de Brasília) -> datetime UTC."""
    if not data:
        return None
    d = str(data).strip()
    h = str(hora).strip() if hora else "00:00:00"
    try:
        local = datetime.strptime(f"{d} {h}", "%d/%m/%Y %H:%M:%S")
    except ValueError:
        try:
            local = datetime.strptime(f"{d} {h}", "%d/%m/%Y %H:%M")
        except ValueError:
            return None
    return local.replace(tzinfo=BRT).astimezone(UTC)


def data_hora_je(valor: object) -> datetime | None:
    """Formato do boletim de urna: YYYYMMDDThhmmss (horário de Brasília)."""
    if not valor:
        return None
    try:
        local = datetime.strptime(str(valor), "%Y%m%dT%H%M%S")
    except ValueError:
        return None
    return local.replace(tzinfo=BRT).astimezone(UTC)


def formatar_data(dt: datetime) -> tuple[str, str]:
    local = dt.astimezone(BRT)
    return local.strftime("%d/%m/%Y"), local.strftime("%H:%M:%S")


def sim_nao(valor: object) -> bool:
    return str(valor or "").strip().lower() in {"s", "sim", "true", "1", "e"}
