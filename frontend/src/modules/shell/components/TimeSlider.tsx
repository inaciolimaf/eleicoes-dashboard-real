import { Badge, Button, Group, SegmentedControl, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconBroadcast } from "@tabler/icons-react";
import { useState } from "react";
import { useTimeline } from "../../events";
import { useFilter } from "../../../lib/filter-store";
import { useTime, SPEEDS, type Speed } from "../../../lib/time-store";
import { brt } from "../../../lib/time";
import { LIVE_DOT_HEX } from "../../../lib/palettes/shell";
import { findAdjacentEvent, useBackToLive, useReplayClock, useTimelineEvents } from "../hooks";
import { TimeTransport } from "./TimeTransport";
import { TimelineTrack } from "./TimelineTrack";

/** Keeps the scrubbed position from snapping back to live when the user releases the slider this close to the end. */
const LIVE_SNAP_MS = 30_000;

function EmptyTimeline({ loading, failed }: { loading: boolean; failed: boolean }) {
  return (
    <Group h="100%" px="md" gap="sm" justify="space-between">
      <Text size="sm" c="dimmed">
        {loading
          ? "Carregando linha do tempo…"
          : failed
            ? "Linha do tempo indisponível"
            : "A linha do tempo aparece com os primeiros snapshots da apuração."}
      </Text>
      <Badge
        variant="light"
        color="red"
        leftSection={<span className="ao-vivo-dot" style={{ width: 6, height: 6 }} />}
      >
        Ao vivo
      </Badge>
    </Group>
  );
}

function LiveButton({
  isLive,
  isMobile,
  onClick,
}: {
  isLive: boolean;
  isMobile: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="xs"
      color="red"
      variant={isLive ? "filled" : "outline"}
      leftSection={
        isLive ? (
          <span className="ao-vivo-dot" style={{ background: LIVE_DOT_HEX, width: 7, height: 7 }} />
        ) : (
          <IconBroadcast size={14} />
        )
      }
      onClick={onClick}
      px={isMobile ? 8 : undefined}
    >
      {isMobile ? "VIVO" : "AO VIVO"}
    </Button>
  );
}

/** Slider global de tempo ("máquina do tempo") com replay e marcadores de eventos. */
export function TimeSlider() {
  const round = useFilter((s) => s.turno);
  const timeline = useTimeline(round);
  const {
    t,
    playing: playing,
    speed: speed,
    updates: newUpdates,
    setT,
    setPlaying: setPlaying,
    setSpeed: setSpeed,
  } = useTime();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const start = timeline.data?.start ? new Date(timeline.data.start).getTime() : null;
  const end = timeline.data?.end ? new Date(timeline.data.end).getTime() : null;
  const currentValue = t ? new Date(t).getTime() : (end ?? 0);
  const [dragging, setDragging] = useState<number | null>(null);
  const backToLive = useBackToLive();
  const events = useTimelineEvents(timeline.data, start, end);
  useReplayClock(playing, start, end, backToLive);

  if (!start || !end || end <= start)
    return <EmptyTimeline loading={timeline.isLoading} failed={!!timeline.error} />;

  const shown = dragging ?? currentValue;
  const isLive = !t;
  const jump = (direction: 1 | -1) => {
    const target = findAdjacentEvent(events, currentValue, direction);
    if (target) setT(new Date(target.ms).toISOString());
  };
  const handleScrubEnd = (value: number) => {
    setDragging(null);
    if (value >= end - LIVE_SNAP_MS) backToLive();
    else setT(new Date(value).toISOString());
  };

  return (
    <Group h="100%" px={{ base: "xs", sm: "md" }} gap="sm" wrap="nowrap">
      <TimeTransport playing={playing} onTogglePlay={() => setPlaying(!playing)} onJump={jump} />
      <SegmentedControl
        size="xs"
        value={String(speed)}
        onChange={(v) => setSpeed(Number(v) as Speed)}
        data={SPEEDS.map((v) => ({ value: String(v), label: `${v}×` }))}
        visibleFrom="md"
        aria-label="Velocidade do replay"
      />
      <TimelineTrack
        events={events}
        start={start}
        end={end}
        value={Math.min(end, Math.max(start, shown))}
        isLive={isLive}
        onChange={setDragging}
        onChangeEnd={handleScrubEnd}
        onMarkerPick={(ms) => setT(new Date(ms).toISOString())}
      />
      <Text
        size="sm"
        fw={700}
        className="num"
        style={{ whiteSpace: "nowrap" }}
        c={isLive ? undefined : "yellow.5"}
      >
        {brt(shown).format(isMobile ? "HH:mm" : "HH:mm:ss")}
      </Text>
      {!isLive && newUpdates > 0 && (
        <Badge
          color="red"
          variant="light"
          style={{ cursor: "pointer" }}
          onClick={backToLive}
          visibleFrom="sm"
        >
          {newUpdates} novidade{newUpdates > 1 ? "s" : ""} — voltar ao vivo
        </Badge>
      )}
      <LiveButton isLive={isLive} isMobile={!!isMobile} onClick={backToLive} />
    </Group>
  );
}
