import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Button,
  Group,
  Text,
  Title,
  useComputedColorScheme,
} from "@mantine/core";
import { IconChartBar, IconClockHour4, IconExternalLink, IconMoonStars, IconSun } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import type { SharedDashboardDto } from "../../../api/models";
import { Loading, ErrorView } from "../../../components/States";
import { LiveIndicator, FilterBar, TimeSlider } from "../../shell";
import { FilterProvider } from "../../../lib/effective-filter";
import { fmtShortDate } from "../../../lib/time";
import { Grid } from "../grid/Grid";
import { applyGlobalFilter } from "../filter-sync";
import { toDashboard } from "../repo";
import { useLive, topic } from "../../realtime";
import { useFilter } from "../../../lib/filter-store";
import { usePrefs } from "../../../lib/prefs-store";

/** "/p/:token": a shared dashboard, read-only, live or frozen at a moment T. */
export function SharedScreen({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ["compartilhado", token],
    queryFn: ({ signal }) => api<SharedDashboardDto>(`/shared/${encodeURIComponent(token)}`, { signal }),
    staleTime: 60_000,
    retry: 1,
  });
  const dashboard = useMemo(() => (query.data ? toDashboard(query.data.dashboard) : null), [query.data]);
  const frozen = query.data?.mode === "frozen" && !!query.data.frozen_time;
  const round = useFilter((s) => s.turno);
  useLive([topic.events(round), topic.status()]);

  useEffect(() => {
    if (dashboard)
      applyGlobalFilter({
        ...dashboard.config,
        filtroGlobal: { ...dashboard.config.filtroGlobal, tempo: "agora" },
      });
  }, [dashboard]);

  return (
    <AppShell header={{ height: 56 }} footer={frozen ? undefined : { height: 64 }} padding={0}>
      <SharedHeader title={dashboard?.name} frozen={frozen} frozenTime={query.data?.frozen_time} />
      <AppShell.Main>
        <FilterBar />
        <Box p={{ base: "xs", sm: "md" }}>
          {query.isLoading ? (
            <Loading rows={6} />
          ) : query.error || !dashboard ? (
            <ErrorView error={query.error ?? new Error("Link inválido ou expirado.")} />
          ) : (
            <FilterProvider value={frozen ? { t: query.data!.frozen_time, tFixo: true } : {}}>
              {dashboard.config.widgets.length === 0 ? (
                <Text c="dimmed">Este painel está vazio.</Text>
              ) : (
                <Grid config={dashboard.config} editing={false} readOnly />
              )}
            </FilterProvider>
          )}
        </Box>
      </AppShell.Main>
      {!frozen && (
        <AppShell.Footer>
          <TimeSlider />
        </AppShell.Footer>
      )}
    </AppShell>
  );
}

function SharedHeader({
  title,
  frozen,
  frozenTime,
}: {
  title?: string;
  frozen: boolean;
  frozenTime?: string | null;
}) {
  const scheme = useComputedColorScheme("dark");
  const setPrefs = usePrefs((s) => s.set);
  return (
    <AppShell.Header>
      <Group h="100%" px="md" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <IconChartBar size={22} color="var(--mantine-color-eleicao-4)" />
          <Title order={4} lineClamp={1}>
            {title ?? "Painel compartilhado"}
          </Title>
          <Badge variant="light" color="gray" visibleFrom="sm">
            somente leitura
          </Badge>
          {frozen && (
            <Badge color="yellow" variant="light" leftSection={<IconClockHour4 size={12} />}>
              congelado em {fmtShortDate(frozenTime)}
            </Badge>
          )}
        </Group>
        <Group gap="xs" wrap="nowrap">
          {!frozen && <LiveIndicator compact />}
          <ActionIcon
            variant="default"
            size="lg"
            onClick={() => setPrefs({ tema: scheme === "dark" ? "claro" : "escuro" })}
            aria-label="Alternar tema"
          >
            {scheme === "dark" ? <IconSun size={18} /> : <IconMoonStars size={18} />}
          </ActionIcon>
          <Button
            component={Link}
            to="/"
            size="xs"
            variant="light"
            rightSection={<IconExternalLink size={14} />}
            visibleFrom="sm"
          >
            Abrir o app
          </Button>
        </Group>
      </Group>
    </AppShell.Header>
  );
}
