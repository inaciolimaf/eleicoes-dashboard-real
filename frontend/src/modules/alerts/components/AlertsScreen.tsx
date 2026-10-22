import { Alert, Button, Group, Stack, Text, Title } from "@mantine/core";
import { useAuth } from "../../../lib/auth-store";
import { useUi } from "../../../lib/ui-store";
import { useAlerts, useDeleteAlert, useSaveAlert } from "../hooks";
import { MyAlertsCard } from "./AlertsTable";
import { NewAlertCard } from "./NewAlertCard";
import { PushCard } from "./PushCard";

/** Notifications screen (`/alertas`): browser push, the rules of the account, and the form to create one. */
export function AlertsScreen() {
  const loggedIn = !!useAuth((s) => s.token);
  const openAuth = useUi((s) => s.setAuthAberto);
  const alerts = useAlerts();
  const save = useSaveAlert();
  const remove = useDeleteAlert();
  return (
    <Stack gap="md" maw={980} mx="auto">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          Notificações
        </Text>
        <Title order={2}>Alertas</Title>
      </Stack>
      <PushCard />
      {loggedIn ? (
        <>
          <NewAlertCard />
          <MyAlertsCard
            query={alerts}
            onToggle={(alert, active) => save.mutate({ ...alert, active })}
            onDelete={(id) => remove.mutate(id)}
          />
        </>
      ) : (
        <Alert variant="light" color="blue" title="Entre para criar alertas">
          <Group justify="space-between">
            <Text size="sm">
              As regras de alerta ficam na sua conta e são avaliadas pelo servidor durante a apuração.
            </Text>
            <Button size="xs" onClick={() => openAuth(true)}>
              Entrar
            </Button>
          </Group>
        </Alert>
      )}
    </Stack>
  );
}
