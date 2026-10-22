import { Badge, Group, Tooltip } from "@mantine/core";
import { IconClockHour4, IconLock, IconMapPin } from "@tabler/icons-react";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { defaultGeoAreaName } from "../../../lib/geo-areas";
import { OFFICE_NAME } from "../../../lib/offices";
import { fmtShortDate } from "../../../lib/time";
import { useFilter } from "../../../lib/filter-store";

/** Badges in the widget header: the area, the time (when frozen) and the lock (when the filter is fixed). */
export function FilterChips({ fixed }: { fixed: boolean }) {
  const filter = useEffectiveFilter();
  const globalName = useFilter((s) => s.nome);
  const globalFilter = useFilter();
  const name =
    !fixed && globalFilter.nivel === filter.nivel && globalFilter.id === filter.id
      ? (globalName ?? defaultGeoAreaName(filter.nivel, filter.id))
      : defaultGeoAreaName(filter.nivel, filter.id);
  return (
    <Group gap={4} wrap="nowrap" visibleFrom="xs" style={{ overflow: "hidden" }}>
      <Tooltip label={`${OFFICE_NAME[filter.cargo] ?? ""} · ${filter.turno}º turno`}>
        <Badge
          size="xs"
          variant="light"
          color="gray"
          leftSection={<IconMapPin size={10} />}
          style={{ maxWidth: 160 }}
        >
          {name}
        </Badge>
      </Tooltip>
      {filter.t && (
        <Badge size="xs" variant="light" color="yellow" leftSection={<IconClockHour4 size={10} />}>
          {fmtShortDate(filter.t)}
        </Badge>
      )}
      {fixed && (
        <Tooltip label="Este widget tem filtro próprio (não herda o filtro do painel)">
          <IconLock size={13} color="var(--mantine-color-yellow-5)" />
        </Tooltip>
      )}
    </Group>
  );
}
