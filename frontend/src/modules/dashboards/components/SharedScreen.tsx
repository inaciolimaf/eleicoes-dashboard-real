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
import { SharedDashboardDto } from "../../../api/models";
import { Loading, ErrorView } from "../../../components/States";
import { LiveIndicator } from "../../shell";
import { FilterBar } from "../../shell";
import { TimeSlider } from "../../shell";
import { FilterProvider } from "../../../lib/effective-filter";
import { fmtShortDate } from "../../../lib/time";
import { Grid } from "./Grid";
import { applyDashboardFilter } from "./DashboardView";
import { toDashboard } from "../repo";
import { useLive } from "../../realtime";
import { topic } from "../../realtime";
import { useFilter } from "../../../lib/filter-store";
import { usePrefs } from "../../../lib/prefs-store";

/** /p/:token — painel compartilhado, somente leitura (ao vivo ou congelado em T). */
export function SharedScreen({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ["compartilhado", token],
    queryFn: ({ signal }) => api<SharedDashboardDto>(`/shared/${encodeURIComponent(token)}`, { signal }),
    staleTime: 60_000,
    retry: 1,
  });
  const painel = useMemo(() => (q.data ? toDashboard(q.data.dashboard) : null), [q.data]);
  const congelado = q.data?.mode === "frozen" && !!q.data.frozen_time;
  const turno = useFilter((s) => s.turno);
  useLive([topic.events(turno), topic.status()]);
  const esquema = useComputedColorScheme("dark");
  const setPrefs = usePrefs((s) => s.set);

  useEffect(() => {
    if (painel)
      applyDashboardFilter({
        ...painel.config,
        filtroGlobal: { ...painel.config.filtroGlobal, tempo: "agora" },
      });
  }, [painel]);

  return (
    <AppShell header={{ height: 56 }} footer={congelado ? undefined : { height: 64 }} padding={0}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <IconChartBar size={22} color="var(--mantine-color-eleicao-4)" />
            <Title order={4} lineClamp={1}>
              {painel?.nome ?? "Painel compartilhado"}
            </Title>
            <Badge variant="light" color="gray" visibleFrom="sm">
              somente leitura
            </Badge>
            {congelado && (
              <Badge color="yellow" variant="light" leftSection={<IconClockHour4 size={12} />}>
                congelado em {fmtShortDate(q.data?.frozen_time)}
              </Badge>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap">
            {!congelado && <LiveIndicator compacto />}
            <ActionIcon
              variant="default"
              size="lg"
              onClick={() => setPrefs({ tema: esquema === "dark" ? "claro" : "escuro" })}
              aria-label="Alternar tema"
            >
              {esquema === "dark" ? <IconSun size={18} /> : <IconMoonStars size={18} />}
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
      <AppShell.Main>
        <FilterBar />
        <Box p={{ base: "xs", sm: "md" }}>
          {q.isLoading ? (
            <Loading linhas={6} />
          ) : q.error || !painel ? (
            <ErrorView erro={q.error ?? new Error("Link inválido ou expirado.")} />
          ) : (
            <FilterProvider value={congelado ? { t: q.data!.frozen_time, tFixo: true } : {}}>
              {painel.config.widgets.length === 0 ? (
                <Text c="dimmed">Este painel está vazio.</Text>
              ) : (
                <Grid config={painel.config} editando={false} somenteLeitura />
              )}
            </FilterProvider>
          )}
        </Box>
      </AppShell.Main>
      {!congelado && (
        <AppShell.Footer>
          <TimeSlider />
        </AppShell.Footer>
      )}
    </AppShell>
  );
}
