import { ActionIcon, AppShell, Badge, Box, Button, Group, Text, Title, useComputedColorScheme } from "@mantine/core";
import { IconChartBar, IconClockHour4, IconExternalLink, IconMoonStars, IconSun } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CompartilhadoResp } from "../api/types";
import { Carregando, ErroView } from "../components/common/Estados";
import { LiveIndicator } from "../components/layout/LiveIndicator";
import { FilterBar } from "../components/layout/FilterBar";
import { TimeSlider } from "../components/layout/TimeSlider";
import { FiltroProvider } from "../lib/filtro-efetivo";
import { fmtDataCurta } from "../lib/time";
import { Grade } from "../paineis/Grade";
import { aplicarFiltroDoPainel } from "../paineis/PainelView";
import { painelDeApi } from "../paineis/repo";
import { useLive } from "../realtime/useLive";
import { topico } from "../realtime/topicos";
import { useFiltro } from "../store/filtro";
import { usePrefs } from "../store/prefs";

/** /p/:token — painel compartilhado, somente leitura (ao vivo ou congelado em T). */
export default function SharedPage() {
  const token = useParams().token ?? "";
  const q = useQuery({
    queryKey: ["compartilhado", token],
    queryFn: ({ signal }) => api<CompartilhadoResp>(`/compartilhados/${encodeURIComponent(token)}`, { signal }),
    staleTime: 60_000,
    retry: 1,
  });
  const painel = useMemo(() => (q.data ? painelDeApi(q.data.painel) : null), [q.data]);
  const congelado = q.data?.modo === "congelado" && !!q.data.tempo;
  const turno = useFiltro((s) => s.turno);
  useLive([topico.eventos(turno), topico.status()]);
  const esquema = useComputedColorScheme("dark");
  const setPrefs = usePrefs((s) => s.set);

  useEffect(() => {
    if (painel) aplicarFiltroDoPainel({ ...painel.config, filtroGlobal: { ...painel.config.filtroGlobal, tempo: "agora" } });
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
                congelado em {fmtDataCurta(q.data?.tempo)}
              </Badge>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap">
            {!congelado && <LiveIndicator compacto />}
            <ActionIcon variant="default" size="lg" onClick={() => setPrefs({ tema: esquema === "dark" ? "claro" : "escuro" })} aria-label="Alternar tema">
              {esquema === "dark" ? <IconSun size={18} /> : <IconMoonStars size={18} />}
            </ActionIcon>
            <Button component={Link} to="/" size="xs" variant="light" rightSection={<IconExternalLink size={14} />} visibleFrom="sm">
              Abrir o app
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <FilterBar />
        <Box p={{ base: "xs", sm: "md" }}>
          {q.isLoading ? (
            <Carregando linhas={6} />
          ) : q.error || !painel ? (
            <ErroView erro={q.error ?? new Error("Link inválido ou expirado.")} />
          ) : (
            <FiltroProvider value={congelado ? { t: q.data!.tempo, tFixo: true } : {}}>
              {painel.config.widgets.length === 0 ? (
                <Text c="dimmed">Este painel está vazio.</Text>
              ) : (
                <Grade config={painel.config} editando={false} somenteLeitura />
              )}
            </FiltroProvider>
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
