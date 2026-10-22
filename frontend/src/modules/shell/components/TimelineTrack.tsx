import { Box, Group, Slider, Text, Tooltip } from "@mantine/core";
import { EVENT_COLORS, EVENT_LABELS } from "../../events";
import { brt, fmtTime } from "../../../lib/time";
import { TIMELINE_MARKER_HEX } from "../../../lib/palettes/shell";
import type { TimelineEventAt } from "../hooks";

interface TimelineTrackProps {
  events: TimelineEventAt[];
  start: number;
  end: number;
  value: number;
  isLive: boolean;
  onChange: (value: number) => void;
  onChangeEnd: (value: number) => void;
  onMarkerPick: (ms: number) => void;
}

/** Event markers drawn above the slider; they sit in a strip that does not take pointer events. */
function EventMarkers({
  events,
  start,
  end,
  onPick,
}: {
  events: TimelineEventAt[];
  start: number;
  end: number;
  onPick: (ms: number) => void;
}) {
  return (
    <Box pos="absolute" top={0} left={8} right={8} h={12} style={{ pointerEvents: "none" }}>
      {events.map(({ event, ms }) => (
        <Tooltip
          key={event.id}
          label={`${fmtTime(event.occurred_at, false)} · ${EVENT_LABELS[event.type] ?? event.type}: ${event.title}`}
        >
          <Box
            className="marcador-evento"
            style={{
              left: `${((ms - start) / (end - start)) * 100}%`,
              background: TIMELINE_MARKER_HEX[EVENT_COLORS[event.type] ?? "blue"],
              pointerEvents: "auto",
            }}
            onClick={() => onPick(ms)}
          />
        </Tooltip>
      ))}
    </Box>
  );
}

/** The scrubbing track: markers, the slider, and the first and last instants under it. */
export function TimelineTrack({
  events,
  start,
  end,
  value,
  isLive,
  onChange,
  onChangeEnd,
  onMarkerPick,
}: TimelineTrackProps) {
  return (
    <Box style={{ flex: 1, minWidth: 80 }} pt={14} pos="relative">
      <EventMarkers events={events} start={start} end={end} onPick={onMarkerPick} />
      <Slider
        min={start}
        max={end}
        step={1000}
        value={value}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
        label={(v) => brt(v).format("HH:mm:ss")}
        size="sm"
        color={isLive ? "red" : "yellow"}
        aria-label="Linha do tempo"
      />
      <Group justify="space-between" mt={2} visibleFrom="sm">
        <Text fz={10} c="dimmed" className="num">
          {brt(start).format("DD/MM HH:mm")}
        </Text>
        <Text fz={10} c="dimmed" className="num">
          {brt(end).format("DD/MM HH:mm")}
        </Text>
      </Group>
    </Box>
  );
}
