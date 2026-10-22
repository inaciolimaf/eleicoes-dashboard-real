import { Alert, Card, Code, Collapse, Button, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconShieldLock } from "@tabler/icons-react";
import { useStatus } from "../../results";
import { Loading, ErrorView } from "../../../components/States";
import { useAuth } from "../../../lib/auth-store";
import { useAdminFake, useAdminHealth, useRunAdminCommand } from "../hooks";
import { CollectorCard } from "./CollectorCard";
import { FakeClockCard } from "./FakeClockCard";
import { Metrics } from "./Metrics";

/** Admin screen (`/admin`): the collector, the fake TSE clock and the health metrics. */
export function AdminScreen() {
  const user = useAuth((s) => s.user);
  const isAdmin = !!user?.is_admin;
  const health = useAdminHealth(isAdmin);
  const fake = useAdminFake(isAdmin);
  const status = useStatus();
  const runCommand = useRunAdminCommand();
  const [showRaw, { toggle: toggleRaw }] = useDisclosure(false);

  if (!isAdmin)
    return (
      <Alert
        color="red"
        variant="light"
        icon={<IconShieldLock />}
        title="Acesso restrito"
        maw={600}
        mx="auto"
      >
        Esta página é só para administradores. O primeiro usuário registrado vira admin.
      </Alert>
    );

  return (
    <Stack gap="md">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          Administração
        </Text>
        <Title order={2}>Saúde do sistema</Title>
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <CollectorCard status={status.data} onCommand={runCommand} />
        <FakeClockCard
          state={fake.data ?? {}}
          error={fake.error as Error | null}
          environment={status.data?.tse_environment}
          onCommand={runCommand}
        />
      </SimpleGrid>

      <Card p="md">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>Métricas do coletor e do worker</Text>
          <Button size="xs" variant="subtle" onClick={toggleRaw}>
            {showRaw ? "Ocultar JSON" : "Ver JSON bruto"}
          </Button>
        </Group>
        {health.isLoading ? (
          <Loading rows={4} />
        ) : health.error ? (
          <ErrorView error={health.error} onRetry={() => health.refetch()} />
        ) : health.data ? (
          <Metrics data={health.data} />
        ) : null}
        <Collapse in={showRaw}>
          <Code block mt="sm">
            {JSON.stringify(health.data, null, 2)}
          </Code>
        </Collapse>
      </Card>
    </Stack>
  );
}
