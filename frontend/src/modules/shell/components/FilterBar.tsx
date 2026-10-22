import { ActionIcon, Badge, Group, ScrollArea, Tooltip } from "@mantine/core";
import { spotlight } from "@mantine/spotlight";
import { IconClockHour4, IconSearch, IconStar, IconStarFilled, IconX } from "@tabler/icons-react";
import { useEffect } from "react";
import { useResults, useStatus, useOfficeWithoutBrResult } from "../../results";
import { useFavorites } from "../../accounts";
import type { GeoAreaRefDto } from "../../../api/models";
import { useFilter } from "../../../lib/filter-store";
import { useTime } from "../../../lib/time-store";
import { OFFICE_NAME } from "../../../lib/offices";
import { fmtShortDate } from "../../../lib/time";
import { ENVIRONMENT } from "./LiveIndicator";
import { FavoriteChips } from "./FavoriteChips";
import { GeoCrumbs, defaultBreadcrumb } from "./GeoCrumbs";

/** Global filter bar: clickable breadcrumb, office, time chip and favorites. */
export function FilterBar() {
  const filter = useFilter();
  const time = useTime((s) => s.t);
  const goLive = useTime((s) => s.goLive);
  const withoutBrResult = useOfficeWithoutBrResult(filter.cargo, filter.nivel);
  const geoQuery = useResults(
    { turno: filter.turno, cargo: filter.cargo, nivel: filter.nivel, id: filter.id, t: time },
    !withoutBrResult && filter.nivel !== "country",
  );
  const { favorites, isFavorite, toggle: toggleFavorite } = useFavorites();
  const status = useStatus();
  const crumbs: GeoAreaRefDto[] = geoQuery.data?.geo_area.breadcrumb?.length
    ? geoQuery.data.geo_area.breadcrumb
    : defaultBreadcrumb(filter.nivel, filter.id, filter.nome);
  const current = crumbs[crumbs.length - 1];

  // keeps the area name for the widget chips
  useEffect(() => {
    if (
      geoQuery.data?.geo_area?.name &&
      geoQuery.data.geo_area.id === filter.id &&
      geoQuery.data.geo_area.name !== filter.nome
    )
      useFilter.getState().setFiltro({ nome: geoQuery.data.geo_area.name });
  }, [geoQuery.data, filter.id, filter.nome]);

  const areaRef = `${filter.nivel}:${filter.id}`;
  const starred = isFavorite("geo_area", areaRef);

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      px={{ base: "xs", sm: "md" }}
      py={6}
      style={{
        borderBottom: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-body)",
      }}
    >
      <ScrollArea type="never" style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs" wrap="nowrap">
          <GeoCrumbs crumbs={crumbs} />
          <Tooltip label={starred ? "Remover dos favoritos" : "Adicionar recorte aos favoritos"}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="yellow"
              onClick={() =>
                toggleFavorite({ type: "geo_area", ref: areaRef, label: current?.name ?? filter.id })
              }
              aria-label="Favoritar recorte"
            >
              {starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
            </ActionIcon>
          </Tooltip>
          <Badge variant="light" color="gray" size="sm" style={{ flexShrink: 0 }}>
            {OFFICE_NAME[filter.cargo] ?? `Cargo ${filter.cargo}`} · {filter.turno}º turno
          </Badge>
          {status.data && status.data.tse_environment !== "oficial" && (
            <Tooltip label="Ambiente de dados (não é o resultado oficial)">
              <Badge variant="outline" color="grape" size="sm" style={{ flexShrink: 0 }}>
                {ENVIRONMENT[status.data.tse_environment] ?? status.data.tse_environment}
              </Badge>
            </Tooltip>
          )}
          {time && (
            <Badge
              color="yellow"
              variant="light"
              size="sm"
              leftSection={<IconClockHour4 size={12} />}
              rightSection={
                <ActionIcon
                  size={14}
                  variant="transparent"
                  color="yellow"
                  onClick={goLive}
                  aria-label="Voltar ao vivo"
                >
                  <IconX size={10} />
                </ActionIcon>
              }
              style={{ flexShrink: 0 }}
            >
              {fmtShortDate(time)}
            </Badge>
          )}
          {favorites.length > 0 && <FavoriteChips favorites={favorites} />}
        </Group>
      </ScrollArea>
      <Tooltip label="Buscar recorte (Ctrl+K)">
        <ActionIcon variant="subtle" onClick={spotlight.open} aria-label="Buscar recorte">
          <IconSearch size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
