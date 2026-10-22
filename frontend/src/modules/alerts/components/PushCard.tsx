import { Button, Card, Group, Stack, Switch, Text } from "@mantine/core";
import { IconBell } from "@tabler/icons-react";
import { usePrefs } from "../../../lib/prefs-store";

/** Asks the browser for notification permission, or toggles push when it was granted. */
export function PushCard() {
  const push = usePrefs((s) => s.push);
  const setPrefs = usePrefs((s) => s.set);
  const permission = typeof Notification !== "undefined" ? Notification.permission : "denied";

  const enablePush = async () => {
    if (typeof Notification === "undefined") return;
    const answer = await Notification.requestPermission();
    setPrefs({ push: answer === "granted" });
    if (answer === "granted")
      new Notification("Notificações ativadas", {
        body: "Você receberá os alertas da apuração.",
        icon: "/favicon.svg",
      });
  };

  return (
    <Card p="md">
      <Group justify="space-between">
        <Stack gap={0}>
          <Text fw={700}>Push do navegador</Text>
          <Text size="sm" c="dimmed">
            Receba os alertas mesmo com a aba em segundo plano. Os toasts no app funcionam sempre.
          </Text>
        </Stack>
        {permission === "granted" ? (
          <Switch
            label="Ativo"
            checked={push}
            onChange={(event) => setPrefs({ push: event.currentTarget.checked })}
          />
        ) : (
          <Button
            leftSection={<IconBell size={16} />}
            onClick={enablePush}
            disabled={permission === "denied"}
          >
            {permission === "denied" ? "Bloqueado no navegador" : "Permitir notificações"}
          </Button>
        )}
      </Group>
    </Card>
  );
}
