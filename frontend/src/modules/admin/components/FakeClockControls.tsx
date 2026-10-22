import { Button, Group, NumberInput, SegmentedControl, Text } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { IconClockPlay, IconPlayerPauseFilled, IconPlayerPlayFilled, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { dayjs } from "../../../lib/time";
import type { AdminCommand } from "../hooks";

type RunCommand = (command: AdminCommand, successMessage: string) => void;

const SPEED_PRESETS = ["1", "10", "60", "300"];

/** Speed presets and a free speed input for the fake clock. */
export function SpeedControls({ onCommand }: { onCommand: RunCommand }) {
  const [speed, setSpeed] = useState<number>(60);
  return (
    <Group align="flex-end" gap="xs">
      <SegmentedControl
        size="xs"
        value={String(speed)}
        onChange={(value) => setSpeed(Number(value))}
        data={SPEED_PRESETS.map((value) => ({ value, label: `${value}×` }))}
      />
      <NumberInput
        size="xs"
        w={90}
        value={speed}
        onChange={(value) => setSpeed(Number(value) || 1)}
        min={0.1}
        max={10000}
        aria-label="Velocidade"
      />
      <Button size="xs" onClick={() => onCommand({ kind: "fake", body: { speed } }, `Velocidade ${speed}×`)}>
        Aplicar velocidade
      </Button>
    </Group>
  );
}

/** Pause/resume the clock, and restart it behind a confirmation. */
export function ClockButtons({ paused, onCommand }: { paused: boolean; onCommand: RunCommand }) {
  return (
    <Group gap="xs">
      <Button
        size="xs"
        variant="light"
        color={paused ? "teal" : "yellow"}
        leftSection={paused ? <IconPlayerPlayFilled size={14} /> : <IconPlayerPauseFilled size={14} />}
        onClick={() =>
          onCommand(
            { kind: "fake", body: { paused: !paused } },
            paused ? "Relógio retomado" : "Relógio pausado",
          )
        }
      >
        {paused ? "Retomar relógio" : "Pausar relógio"}
      </Button>
      <Button
        size="xs"
        variant="light"
        color="red"
        leftSection={<IconRefresh size={14} />}
        onClick={() =>
          modals.openConfirmModal({
            title: "Reiniciar a simulação",
            children: <Text size="sm">O relógio do tse-fake volta ao início da noite gravada.</Text>,
            labels: { confirm: "Reiniciar", cancel: "Cancelar" },
            confirmProps: { color: "red" },
            onConfirm: () => onCommand({ kind: "fake", body: { restart: true } }, "Simulação reiniciada"),
          })
        }
      >
        Reiniciar
      </Button>
    </Group>
  );
}

/** Moves the clock to a Brasília date and time. */
export function JumpControl({ onCommand }: { onCommand: RunCommand }) {
  const [target, setTarget] = useState<Date | null>(null);
  return (
    <Group align="flex-end" gap="xs">
      <DateTimePicker
        size="xs"
        label="Ir para (horário de Brasília)"
        value={target}
        onChange={setTarget}
        valueFormat="DD/MM/YYYY HH:mm"
        w={220}
        clearable
      />
      <Button
        size="xs"
        leftSection={<IconClockPlay size={14} />}
        disabled={!target}
        onClick={() => {
          if (target)
            onCommand(
              { kind: "fake", body: { go_to: dayjs(target).toISOString() } },
              "Relógio reposicionado",
            );
        }}
      >
        Ir
      </Button>
    </Group>
  );
}
