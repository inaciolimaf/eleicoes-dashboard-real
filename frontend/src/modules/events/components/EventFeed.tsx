import type { EventType } from "../../../api/models";
import { ActionIcon, Anchor, Badge, Group, ScrollArea, Stack, Text, ThemeIcon, Tooltip } from "@mantine/core";
import {
  IconArrowsExchange,
  IconClockPlay,
  IconFlag,
  IconMathFunction,
  IconPlayerPlay,
  IconRepeat,
  IconTrophy,
  type Icon,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import type { EventDto, Level } from "../../../api/models";
import { useEvents } from "../hooks";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { fmtShortDate, fmtTime } from "../../../lib/time";
import { geoAreaLink } from "../../../lib/geo-areas";
import { OFFICE_NAME } from "../../../lib/offices";
import { EVENT_COLORS, EVENT_LABELS } from "../lib";
import { useLive, topic } from "../../realtime";
import { useTime } from "../../../lib/time-store";
import { usePrefs } from "../../../lib/prefs-store";
import { Loading, ErrorView, NoData } from "../../../components/States";

/** Icon of each event type, keyed by the API values. */
export const EVENT_ICONS: Record<EventType, Icon> = {
  start: IconPlayerPlay,
  milestone: IconFlag,
  lead_change: IconArrowsExchange,
  elected: IconTrophy,
  mathematically_decided: IconMathFunction,
  runoff: IconRepeat,
};

export const EVENT_TYPES = Object.keys(EVENT_LABELS).map((k) => ({ value: k, label: EVENT_LABELS[k] }));

export function EventItem({ event, compact }: { event: EventDto; compact?: boolean }) {
  const EventIcon = EVENT_ICONS[event.type] ?? IconFlag;
  const color = EVENT_COLORS[event.type] ?? "blue";
  const setT = useTime((s) => s.setT);
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start" py={6}>
      <ThemeIcon variant="light" color={color} radius="xl" size={compact ? 26 : 32}>
        <EventIcon size={compact ? 14 : 18} />
      </ThemeIcon>
      <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Text size="sm" fw={700} lineClamp={1}>
            {event.level && event.geo_area_id ? (
              <Anchor
                component={Link}
                to={geoAreaLink(event.level as Level, event.geo_area_id)}
                inherit
                c="inherit"
              >
                {event.title}
              </Anchor>
            ) : (
              event.title
            )}
          </Text>
          <Text size="xs" c="dimmed" className="num" style={{ whiteSpace: "nowrap" }}>
            {fmtTime(event.occurred_at, false)}
          </Text>
        </Group>
        {event.description && (
          <Text size="xs" c="dimmed" lineClamp={compact ? 1 : 3}>
            {event.description}
          </Text>
        )}
        {!compact && (
          <Group gap={6}>
            <Badge size="xs" variant="light" color={color}>
              {EVENT_LABELS[event.type] ?? event.type}
            </Badge>
            {event.office_code ? (
              <Badge size="xs" variant="outline" color="gray">
                {OFFICE_NAME[Number(event.office_code)] ?? `Cargo ${event.office_code}`}
              </Badge>
            ) : null}
            <Tooltip label={`Ver o painel como estava em ${fmtShortDate(event.occurred_at)}`}>
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={() => setT(event.occurred_at)}
                aria-label="Ir para este momento"
              >
                <IconClockPlay size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Stack>
    </Group>
  );
}

export interface EventFeedProps {
  tipos?: string[];
  limite?: number;
  cargo?: number | null;
  nivel?: Level | null;
  id?: string | null;
  compacto?: boolean;
  alturaMax?: number | string;
}

function EventList({
  events,
  compact,
  animated,
}: {
  events: EventDto[];
  compact?: boolean;
  animated: boolean;
}) {
  return (
    <Stack gap={0}>
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <motion.div
            key={e.id}
            initial={animated ? { opacity: 0, x: -12, height: 0 } : false}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
          >
            <EventItem event={e} compact={compact} />
          </motion.div>
        ))}
      </AnimatePresence>
    </Stack>
  );
}

/** Live feed of the results' events, in the current round and time. */
export function EventFeed({ tipos, limite = 50, cargo, nivel, id, compacto, alturaMax }: EventFeedProps) {
  const f = useEffectiveFilter();
  const animated = usePrefs((s) => s.animacoes);
  const q = useEvents(
    f.turno,
    {
      types: tipos as EventType[],
      limit: limite,
      office: cargo ?? null,
      level: nivel ?? null,
      id: id ?? null,
    },
    f.t,
  );
  useLive([topic.events(f.turno)]);
  if (q.isLoading) return <Loading rows={5} />;
  if (q.error) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length)
    return (
      <NoData title="Nenhum evento ainda">
        Viradas, marcos da apuração e eleitos aparecem aqui em tempo real.
      </NoData>
    );
  const list = <EventList events={q.data} compact={compacto} animated={animated} />;
  return alturaMax ? (
    <ScrollArea.Autosize mah={alturaMax} className="scroll-fino">
      {list}
    </ScrollArea.Autosize>
  ) : (
    list
  );
}
