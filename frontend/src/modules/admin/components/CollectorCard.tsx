import { Badge, Button, Card, Group, Text } from "@mantine/core";
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import type { StatusDto } from "../../../api/models";
import { fmtNum } from "../../../lib/formatting";
import { fmtDateTime } from "../../../lib/time";
import type { AdminCommand } from "../hooks";

interface CollectorCardProps {
  status: StatusDto | undefined;
  onCommand: (command: AdminCommand, successMessage: string) => void;
}

/** TSE collector: its state, its request rate, the pause/resume buttons and the last collection times. */
export function CollectorCard({ status, onCommand }: CollectorCardProps) {
  const paused = status?.collector.paused;
  return (
    <Card p="md">
      <Group justify="space-between" mb="sm">
        <Text fw={700}>Coletor do TSE</Text>
        <Badge color={paused ? "yellow" : "teal"} variant="light">
          {paused ? "pausado" : "rodando"} · {fmtNum(status?.collector.requests_per_second ?? 0, 1)} req/s
        </Badge>
      </Group>
      <Group>
        <Button
          color="yellow"
          variant={paused ? "default" : "filled"}
          leftSection={<IconPlayerPauseFilled size={16} />}
          disabled={paused}
          onClick={() => onCommand({ kind: "pause" }, "Coletor pausado")}
        >
          Pausar
        </Button>
        <Button
          color="teal"
          variant={paused ? "filled" : "default"}
          leftSection={<IconPlayerPlayFilled size={16} />}
          disabled={!paused}
          onClick={() => onCommand({ kind: "resume" }, "Coletor retomado")}
        >
          Retomar
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mt="sm">
        Última coleta: {fmtDateTime(status?.last_collection)} · última totalização:{" "}
        {fmtDateTime(status?.last_tally)}
      </Text>
    </Card>
  );
}
