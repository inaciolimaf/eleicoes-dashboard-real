import type { EventType } from "../../../api/models";
import { ActionIcon, Anchor, Badge, Group, ScrollArea, Stack, Text, ThemeIcon, Tooltip } from "@mantine/core";
import {
  IconArrowsExchange,
  IconCircleCheck,
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
import { useEventos } from "../hooks";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { fmtShortDate, fmtTime } from "../../../lib/time";
import { geoAreaLink } from "../../../lib/geo-areas";
import { OFFICE_NAME } from "../../../lib/offices";
import { EVENT_COLORS, EVENT_LABELS } from "../lib";
import { useLive } from "../../realtime";
import { topic } from "../../realtime";
import { useTime } from "../../../lib/time-store";
import { usePrefs } from "../../../lib/prefs-store";
import { Loading, ErrorView, NoData } from "../../../components/States";

export const EVENT_ICONS: Record<string, Icon> = {
  virada: IconArrowsExchange,
  marco: IconFlag,
  eleito: IconTrophy,
  segundo_turno: IconRepeat,
  matematicamente_definido: IconMathFunction,
  finalizado: IconCircleCheck,
  inicio: IconPlayerPlay,
};

export const EVENT_TYPES = Object.keys(EVENT_LABELS).map((k) => ({ value: k, label: EVENT_LABELS[k] }));

export function EventItem({ e, compacto }: { e: EventDto; compacto?: boolean }) {
  const Icone = EVENT_ICONS[e.type] ?? IconFlag;
  const cor = EVENT_COLORS[e.type] ?? "blue";
  const setT = useTime((s) => s.setT);
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start" py={6}>
      <ThemeIcon variant="light" color={cor} radius="xl" size={compacto ? 26 : 32}>
        <Icone size={compacto ? 14 : 18} />
      </ThemeIcon>
      <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Text size="sm" fw={700} lineClamp={1}>
            {e.level && e.geo_area_id ? (
              <Anchor component={Link} to={geoAreaLink(e.level as Level, e.geo_area_id)} inherit c="inherit">
                {e.title}
              </Anchor>
            ) : (
              e.title
            )}
          </Text>
          <Text size="xs" c="dimmed" className="num" style={{ whiteSpace: "nowrap" }}>
            {fmtTime(e.occurred_at, false)}
          </Text>
        </Group>
        {e.description && (
          <Text size="xs" c="dimmed" lineClamp={compacto ? 1 : 3}>
            {e.description}
          </Text>
        )}
        {!compacto && (
          <Group gap={6}>
            <Badge size="xs" variant="light" color={cor}>
              {EVENT_LABELS[e.type] ?? e.type}
            </Badge>
            {e.office_code ? (
              <Badge size="xs" variant="outline" color="gray">
                {OFFICE_NAME[Number(e.office_code)] ?? `Cargo ${e.office_code}`}
              </Badge>
            ) : null}
            <Tooltip label={`Ver o painel como estava em ${fmtShortDate(e.occurred_at)}`}>
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={() => setT(e.occurred_at)}
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

export function EventFeed({ tipos, limite = 50, cargo, nivel, id, compacto, alturaMax }: EventFeedProps) {
  const f = useEffectiveFilter();
  const animacoes = usePrefs((s) => s.animacoes);
  const q = useEventos(
    f.turno,
    { tipos: tipos as EventType[], limite, cargo: cargo ?? null, nivel: nivel ?? null, id: id ?? null },
    f.t,
  );
  useLive([topic.events(f.turno)]);
  if (q.isLoading) return <Loading linhas={5} />;
  if (q.error) return <ErrorView erro={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length)
    return (
      <NoData titulo="Nenhum evento ainda">
        Viradas, marcos da apuração e eleitos aparecem aqui em tempo real.
      </NoData>
    );
  const lista = (
    <Stack gap={0}>
      <AnimatePresence initial={false}>
        {q.data.map((e) => (
          <motion.div
            key={e.id}
            initial={animacoes ? { opacity: 0, x: -12, height: 0 } : false}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
          >
            <EventItem e={e} compacto={compacto} />
          </motion.div>
        ))}
      </AnimatePresence>
    </Stack>
  );
  return alturaMax ? (
    <ScrollArea.Autosize mah={alturaMax} className="scroll-fino">
      {lista}
    </ScrollArea.Autosize>
  ) : (
    lista
  );
}
