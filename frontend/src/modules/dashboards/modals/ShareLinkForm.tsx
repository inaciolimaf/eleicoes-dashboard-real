import { Alert, Button, CopyButton, Group, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { IconCheck, IconCopy, IconLink } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../../../api/client";
import type { ShareCreate, ShareDto, ShareMode } from "../../../api/models";
import { useTime } from "../../../lib/time-store";
import { dayjs } from "../../../lib/time";
import type { Dashboard } from "../repo";

/** State of the share form. It lives above the modal so the choices survive closing it. */
export function useShareLink(dashboard: Dashboard | null) {
  const currentTime = useTime((s) => s.t);
  const [mode, setMode] = useState<ShareMode>("live");
  const [frozenAt, setFrozenAt] = useState<Date | null>(currentTime ? new Date(currentTime) : new Date());
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!dashboard) return;
    setLoading(true);
    setError(null);
    try {
      const share = await api<ShareDto>(`/dashboards/${dashboard.id}/shares`, {
        method: "POST",
        body: {
          mode,
          frozen_time: mode === "frozen" && frozenAt ? dayjs(frozenAt).toISOString() : null,
        } satisfies ShareCreate,
      });
      setLink(`${location.origin}/p/${encodeURIComponent(share.token)}`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return { mode, setMode, frozenAt, setFrozenAt, link, setLink, error, loading, generate };
}

export type ShareState = ReturnType<typeof useShareLink>;

interface ShareLinkFormProps {
  dashboard: Dashboard;
  share: ShareState;
}

/** Choice of live or frozen sharing, the button that creates the link, and the link with a copy button. */
export function ShareLinkForm({ dashboard, share }: ShareLinkFormProps) {
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        O link abre o painel “{dashboard.name}” em modo somente leitura, sem precisar de login.
      </Text>
      <SegmentedControl
        value={share.mode}
        onChange={(value) => share.setMode(value as ShareMode)}
        data={[
          { value: "live", label: "Seguir ao vivo" },
          { value: "frozen", label: "Congelado no tempo T" },
        ]}
      />
      {share.mode === "frozen" && (
        <DateTimePicker
          label="Instante (horário de Brasília)"
          value={share.frozenAt}
          onChange={share.setFrozenAt}
          valueFormat="DD/MM/YYYY HH:mm"
        />
      )}
      <Button leftSection={<IconLink size={16} />} onClick={share.generate} loading={share.loading}>
        Gerar link
      </Button>
      {share.error && (
        <Alert color="red" variant="light">
          {share.error}
        </Alert>
      )}
      {share.link && <LinkRow link={share.link} />}
    </Stack>
  );
}

function LinkRow({ link }: { link: string }) {
  return (
    <Group gap={6} wrap="nowrap">
      <TextInput value={link} readOnly style={{ flex: 1 }} onFocus={(e) => e.currentTarget.select()} />
      <CopyButton value={link}>
        {({ copied, copy }) => (
          <Button
            color={copied ? "teal" : undefined}
            onClick={copy}
            leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          >
            {copied ? "Copiado" : "Copiar"}
          </Button>
        )}
      </CopyButton>
    </Group>
  );
}
