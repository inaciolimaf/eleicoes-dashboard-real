import { ActionIcon, Box, Group, Paper, SegmentedControl, Text, Title, Tooltip } from "@mantine/core";
import { useFullscreen, useIdle } from "@mantine/hooks";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loading } from "../../../components/States";
import { LiveIndicator } from "../../shell";
import { brt } from "../../../lib/time";
import { Grid } from "../grid/Grid";
import { applyGlobalFilter } from "../filter-sync";
import { useDashboards } from "../hooks";
import type { Dashboard } from "../repo";
import { defaultTemplate } from "../templates";
import { useLive, topic } from "../../realtime";
import { useFilter } from "../../../lib/filter-store";
import { useUi } from "../../../lib/ui-store";
import { useTvRotation } from "./useTvRotation";

/** Shown when the user has no dashboards: the ready-made election night. */
const fallbackDashboard = (): Dashboard => ({
  id: "template",
  name: "Noite da eleição",
  position: 0,
  isDefault: false,
  config: defaultTemplate(),
  updatedAt: "",
  remote: false,
});

const ROTATION_SECONDS = ["15", "30", "60", "120"];

/** TV mode: full screen, dashboards rotate automatically, large type. */
export function TvScreen({ searchParams }: { searchParams: URLSearchParams }) {
  const repo = useDashboards();
  const navigate = useNavigate();
  const { toggle, fullscreen } = useFullscreen();
  const idle = useIdle(3500);
  const setTvMode = useUi((s) => s.setModoTv);
  const round = useFilter((s) => s.turno);
  useLive([topic.events(round), topic.status()]);
  const list = useMemo(
    () => (repo.dashboards.length ? repo.dashboards : [fallbackDashboard()]),
    [repo.dashboards],
  );
  const startIndex = Math.max(
    0,
    list.findIndex((d) => d.id === searchParams.get("inicio")),
  );
  const rotation = useTvRotation(list.length, startIndex);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setTvMode(true);
    return () => setTvMode(false);
  }, [setTvMode]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const current = list[rotation.index % list.length];
  useEffect(() => {
    if (current) applyGlobalFilter(current.config);
  }, [current]);

  if (repo.isLoading) return <Loading rows={8} />;
  return (
    <Box p="md" mih="100vh" style={{ cursor: idle ? "none" : undefined }}>
      <Group justify="space-between" mb="md" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <Title order={1} style={{ letterSpacing: -0.6 }} lineClamp={1}>
            {current?.name}
          </Title>
          {list.length > 1 && (
            <Text c="dimmed" className="num">
              {(rotation.index % list.length) + 1}/{list.length}
            </Text>
          )}
        </Group>
        <Group gap="lg" wrap="nowrap">
          <LiveIndicator />
          <Text fw={800} className="num" fz={28}>
            {brt(now).format("HH:mm:ss")}
          </Text>
        </Group>
      </Group>
      {current && <Grid key={current.id} config={current.config} editing={false} readOnly tvMode />}
      <TvControls
        idle={idle}
        running={rotation.running}
        seconds={rotation.seconds}
        fullscreen={fullscreen}
        onPrevious={() => rotation.setIndex((i) => (i - 1 + list.length) % list.length)}
        onNext={() => rotation.setIndex((i) => (i + 1) % list.length)}
        onToggleRunning={() => rotation.setRunning(!rotation.running)}
        onSeconds={(value) => rotation.setSeconds(Number(value))}
        onToggleFullscreen={toggle}
        onExit={() => {
          if (fullscreen) toggle();
          navigate(-1);
        }}
      />
    </Box>
  );
}

interface TvControlsProps {
  idle: boolean;
  running: boolean;
  seconds: number;
  fullscreen: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToggleRunning: () => void;
  onSeconds: (value: string) => void;
  onToggleFullscreen: () => void;
  onExit: () => void;
}

/** Floating bar at the bottom: previous/next, play/pause, rotation time, full screen and exit. Fades when idle. */
function TvControls({
  idle,
  running,
  seconds,
  fullscreen,
  onPrevious,
  onNext,
  onToggleRunning,
  onSeconds,
  onToggleFullscreen,
  onExit,
}: TvControlsProps) {
  return (
    <Paper
      withBorder
      shadow="xl"
      p={6}
      radius="xl"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 400,
        opacity: idle ? 0 : 1,
        transition: "opacity 300ms ease",
      }}
    >
      <Group gap={6} wrap="nowrap">
        <ActionIcon variant="subtle" onClick={onPrevious} aria-label="Painel anterior">
          <IconChevronLeft size={18} />
        </ActionIcon>
        <ActionIcon
          variant="filled"
          radius="xl"
          onClick={onToggleRunning}
          aria-label={running ? "Pausar rotação" : "Retomar rotação"}
        >
          {running ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
        </ActionIcon>
        <ActionIcon variant="subtle" onClick={onNext} aria-label="Próximo painel">
          <IconChevronRight size={18} />
        </ActionIcon>
        <SegmentedControl
          size="xs"
          value={String(seconds)}
          onChange={onSeconds}
          data={ROTATION_SECONDS.map((value) => ({ value, label: `${value}s` }))}
        />
        <Tooltip label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}>
          <ActionIcon variant="subtle" onClick={onToggleFullscreen} aria-label="Tela cheia">
            {fullscreen ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Sair do modo TV">
          <ActionIcon variant="subtle" color="red" onClick={onExit} aria-label="Sair do modo TV">
            <IconX size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  );
}
