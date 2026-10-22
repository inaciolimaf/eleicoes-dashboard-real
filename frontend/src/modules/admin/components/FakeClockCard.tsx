import { Badge, Card, Group, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import type { FakeTseStateDto } from "../../../api/models";
import { ClockButtons, JumpControl, SpeedControls } from "./FakeClockControls";
import { MetricValue, humanLabel } from "./MetricValue";
import type { AdminCommand } from "../hooks";

interface FakeClockCardProps {
  state: Partial<FakeTseStateDto>;
  error: Error | null;
  environment: string | undefined;
  onCommand: (command: AdminCommand, successMessage: string) => void;
}

/** The state of the fake TSE clock (only in the "fake" environment) and its controls. */
export function FakeClockCard({ state, error, environment, onCommand }: FakeClockCardProps) {
  return (
    <Card p="md">
      <Group justify="space-between" mb="sm">
        <Text fw={700}>Relógio do TSE simulado (tse-fake)</Text>
        {environment !== "fake" && (
          <Badge color="gray" variant="light">
            ambiente {environment ?? "?"}
          </Badge>
        )}
      </Group>
      {error ? (
        <Text size="sm" c="dimmed">
          Indisponível ({error.message}). Só funciona no ambiente “fake”.
        </Text>
      ) : (
        <Stack gap="sm">
          <ClockValues state={state} />
          <SpeedControls onCommand={onCommand} />
          <ClockButtons paused={state.paused === true} onCommand={onCommand} />
          <JumpControl onCommand={onCommand} />
        </Stack>
      )}
    </Card>
  );
}

/** The scalar values of the clock as small tiles. */
function ClockValues({ state }: { state: Partial<FakeTseStateDto> }) {
  return (
    <SimpleGrid cols={2} spacing="xs">
      {Object.entries(state)
        .filter(([, value]) => value === null || typeof value !== "object")
        .map(([key, value]) => (
          <Paper key={key} withBorder p={6}>
            <Text fz={10} c="dimmed" tt="uppercase" fw={600}>
              {humanLabel(key)}
            </Text>
            <MetricValue value={value} />
          </Paper>
        ))}
    </SimpleGrid>
  );
}
