import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Menu,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconCloudUpload,
  IconCopy,
  IconDots,
  IconDownload,
  IconFileImport,
  IconLayoutDashboard,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loading, ErrorView } from "../../../components/States";
import { useDashboards } from "../hooks";
import { NewDashboardModal } from "../modals/NewDashboardModal";
import { readDashboardFile, downloadDashboardFile } from "../file";
import { REGISTRY } from "../widgets/registry";
import { fmtShortDate } from "../../../lib/time";
import type { Dashboard } from "../repo";

/** "/paineis": the user's dashboards, with the actions of each one. */
export function DashboardsScreen() {
  const repo = useDashboards();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  if (repo.isLoading) return <Loading rows={5} />;
  if (repo.error) return <ErrorView error={repo.error} />;
  const move = (index: number, delta: -1 | 1) => {
    const ids = repo.dashboards.map((d) => d.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    repo.reorder(ids);
  };
  const importFile = async (file: File | null) => {
    if (!file) return;
    try {
      const imported = readDashboardFile(await file.text());
      const created = await repo.create(imported.name, imported.config, false);
      notifications.show({ color: "teal", title: "Painel importado", message: created.name });
    } catch (error) {
      notifications.show({ color: "red", title: "Falha ao importar", message: (error as Error).message });
    }
  };
  return (
    <Stack gap="md">
      <ListHeader onImport={importFile} onNew={() => setNewOpen(true)} />
      {!repo.isLoggedIn && (
        <Alert variant="light" color="blue">
          Sem login, os painéis ficam salvos neste navegador. Entre na sua conta para levá-los a outros
          dispositivos e compartilhar.
        </Alert>
      )}
      {repo.pendingLocalCount > 0 && (
        <Alert variant="light" color="teal" icon={<IconCloudUpload />} title="Painéis deste navegador">
          <Group justify="space-between">
            <Text size="sm">Há {repo.pendingLocalCount} painel(is) salvo(s) só neste navegador.</Text>
            <Button
              size="xs"
              onClick={async () => {
                const count = await repo.migrateLocal();
                notifications.show({
                  color: "teal",
                  message: `${count} painel(is) enviados para a sua conta.`,
                });
              }}
            >
              Enviar painéis locais para a conta
            </Button>
          </Group>
        </Alert>
      )}
      {repo.dashboards.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <IconLayoutDashboard size={40} opacity={0.5} />
            <Text>Você ainda não tem painéis.</Text>
            <Button onClick={() => setNewOpen(true)}>Criar a partir de um template</Button>
          </Stack>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {repo.dashboards.map((dashboard, index) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              index={index}
              total={repo.dashboards.length}
              onMove={move}
              onDuplicate={async () => {
                const copy = await repo.create(`${dashboard.name} (cópia)`, dashboard.config, false);
                navigate(`/paineis/${copy.id}`);
              }}
              onSetDefault={() => repo.setDefault(dashboard.id)}
              onRemove={() =>
                modals.openConfirmModal({
                  title: "Apagar painel",
                  children: <Text size="sm">Apagar “{dashboard.name}”?</Text>,
                  labels: { confirm: "Apagar", cancel: "Cancelar" },
                  confirmProps: { color: "red" },
                  onConfirm: () => repo.remove(dashboard.id),
                })
              }
            />
          ))}
        </SimpleGrid>
      )}
      <NewDashboardModal open={newOpen} onClose={() => setNewOpen(false)} />
    </Stack>
  );
}

function ListHeader({ onImport, onNew }: { onImport: (file: File | null) => void; onNew: () => void }) {
  return (
    <Group justify="space-between" wrap="wrap">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          Personalização
        </Text>
        <Title order={2}>Meus painéis</Title>
      </Stack>
      <Group gap="xs">
        <FileButton onChange={onImport} accept="application/json,.json">
          {(props) => (
            <Button variant="default" leftSection={<IconFileImport size={16} />} {...props}>
              Importar JSON
            </Button>
          )}
        </FileButton>
        <Button leftSection={<IconPlus size={16} />} onClick={onNew}>
          Novo painel
        </Button>
      </Group>
    </Group>
  );
}

interface DashboardCardProps {
  dashboard: Dashboard;
  index: number;
  total: number;
  onMove: (index: number, delta: -1 | 1) => void;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
}

/** One dashboard in the list: name, summary, widget types, reorder buttons and the actions menu. */
function DashboardCard({
  dashboard,
  index,
  total,
  onMove,
  onDuplicate,
  onSetDefault,
  onRemove,
}: DashboardCardProps) {
  const widgetTypes = [...new Set(dashboard.config.widgets.map((widget) => widget.tipo))].slice(0, 5);
  return (
    <Card p="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            {dashboard.isDefault && <IconStarFilled size={14} color="var(--mantine-color-yellow-5)" />}
            <Text
              fw={700}
              component={Link}
              to={`/paineis/${dashboard.id}`}
              c="inherit"
              lineClamp={1}
              style={{ textDecoration: "none" }}
            >
              {dashboard.name}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {dashboard.config.widgets.length} widgets · atualizado {fmtShortDate(dashboard.updatedAt)}
          </Text>
          <Group gap={4}>
            {widgetTypes.map((type) => (
              <Badge key={type} size="xs" variant="light" color="gray">
                {REGISTRY[type].name}
              </Badge>
            ))}
          </Group>
        </Stack>
        <Group gap={2} wrap="nowrap">
          <Tooltip label="Mover para cima">
            <ActionIcon
              variant="subtle"
              size="sm"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
              aria-label="Mover para cima"
            >
              <IconArrowUp size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Mover para baixo">
            <ActionIcon
              variant="subtle"
              size="sm"
              disabled={index === total - 1}
              onClick={() => onMove(index, 1)}
              aria-label="Mover para baixo"
            >
              <IconArrowDown size={14} />
            </ActionIcon>
          </Tooltip>
          <DashboardCardMenu
            dashboard={dashboard}
            onDuplicate={onDuplicate}
            onSetDefault={onSetDefault}
            onRemove={onRemove}
          />
        </Group>
      </Group>
      <Button component={Link} to={`/paineis/${dashboard.id}`} variant="light" mt="md" fullWidth>
        Abrir
      </Button>
    </Card>
  );
}

function DashboardCardMenu({
  dashboard,
  onDuplicate,
  onSetDefault,
  onRemove,
}: {
  dashboard: Dashboard;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label="Opções">
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconStar size={14} />} disabled={dashboard.isDefault} onClick={onSetDefault}>
          Definir como padrão
        </Menu.Item>
        <Menu.Item leftSection={<IconCopy size={14} />} onClick={onDuplicate}>
          Duplicar
        </Menu.Item>
        <Menu.Item
          leftSection={<IconDownload size={14} />}
          onClick={() => downloadDashboardFile(dashboard.name, dashboard.config)}
        >
          Exportar JSON
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onRemove}>
          Apagar
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
