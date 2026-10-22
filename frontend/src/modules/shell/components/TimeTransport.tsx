import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
} from "@tabler/icons-react";

interface TimeTransportProps {
  playing: boolean;
  onTogglePlay: () => void;
  onJump: (direction: 1 | -1) => void;
}

/** Previous event, play/pause and next event buttons of the time slider. */
export function TimeTransport({ playing, onTogglePlay, onJump }: TimeTransportProps) {
  return (
    <Group gap={4} wrap="nowrap">
      <Tooltip label="EventDto anterior">
        <ActionIcon
          variant="subtle"
          onClick={() => onJump(-1)}
          aria-label="EventDto anterior"
          visibleFrom="sm"
        >
          <IconPlayerTrackPrev size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={playing ? "Pausar replay" : "Reproduzir a apuração (replay)"}>
        <ActionIcon
          variant="filled"
          radius="xl"
          size="lg"
          onClick={onTogglePlay}
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Próximo evento">
        <ActionIcon variant="subtle" onClick={() => onJump(1)} aria-label="Próximo evento" visibleFrom="sm">
          <IconPlayerTrackNext size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
