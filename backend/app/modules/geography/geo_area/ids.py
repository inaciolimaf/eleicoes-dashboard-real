"""Builds the geo area ids from the TSE numbers (the inverse of `area.parse`)."""


def municipality_id_of(uf: str, municipality_code: int) -> str:
    return f"{uf.lower()}{municipality_code:05d}"


def zone_id_of(uf: str, municipality_code: int, zone: int) -> str:
    return f"{municipality_id_of(uf, municipality_code)}-z{zone:04d}"


def polling_place_id_of(uf: str, municipality_code: int, zone: int, polling_place: int) -> str:
    return f"{zone_id_of(uf, municipality_code, zone)}-l{polling_place:04d}"


def section_id_of(uf: str, municipality_code: int, zone: int, section: int) -> str:
    return f"{zone_id_of(uf, municipality_code, zone)}-s{section:04d}"


# TEMPORARY: removed by the main agent after integration. The results and collector slices still
# import the Portuguese names.
municipio_id = municipality_id_of
zona_id = zone_id_of
local_id = polling_place_id_of
secao_id = section_id_of
