import { Badge, Group, Loader, Title, Tooltip } from "@mantine/core";
import { IconCloudCheck, IconStar } from "@tabler/icons-react";
import type { Dashboard } from "../repo";

interface DashboardHeaderProps {
  dashboard: Dashboard;
  saving: boolean;
  savedAt: Date | null;
}

/** Title of the dashboard, its badges and the save status. */
export function DashboardHeader({ dashboard, saving, savedAt }: DashboardHeaderProps) {
  return (
    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
      <Title order={3} lineClamp={1}>
        {dashboard.name}
      </Title>
      {dashboard.isDefault && (
        <Tooltip label="Painel padrão (abre na página inicial)">
          <IconStar size={16} fill="var(--mantine-color-yellow-5)" color="var(--mantine-color-yellow-5)" />
        </Tooltip>
      )}
      <Badge variant="light" color={dashboard.remote ? "teal" : "gray"} size="sm">
        {dashboard.remote ? "na conta" : "neste navegador"}
      </Badge>
      {saving ? (
        <Loader size={14} />
      ) : savedAt ? (
        <Tooltip label={`Salvo às ${savedAt.toLocaleTimeString("pt-BR")}`}>
          <IconCloudCheck size={16} color="var(--mantine-color-teal-5)" />
        </Tooltip>
      ) : null}
    </Group>
  );
}
