import { ActionIcon, Badge, Card, Stack, Switch, Table, Text, Tooltip } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AlertDto } from "../../../api/models";
import { ErrorView, Loading, NoData } from "../../../components/States";
import { fmtShortDate } from "../../../lib/time";
import { ALERT_TYPE_OPTIONS, describeAlert } from "../rules";

interface AlertsTableProps {
  alerts: AlertDto[];
  onToggle: (alert: AlertDto, active: boolean) => void;
  onDelete: (id: string) => void;
}

/** The user's rules: what each one says, when it last fired, and the on/off and delete controls. */
function AlertsTable({ alerts, onToggle, onDelete }: AlertsTableProps) {
  return (
    <Table verticalSpacing="xs" highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Regra</Table.Th>
          <Table.Th>Disparado</Table.Th>
          <Table.Th>Ativo</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {alerts.map((alert) => (
          <Table.Tr key={alert.id}>
            <Table.Td>
              <RuleCell alert={alert} />
            </Table.Td>
            <Table.Td>
              <Text size="sm" className="num">
                {alert.triggered_at ? fmtShortDate(alert.triggered_at) : "—"}
              </Text>
            </Table.Td>
            <Table.Td>
              <Switch
                checked={alert.active}
                onChange={(event) => onToggle(alert, event.currentTarget.checked)}
                aria-label="Ativo"
              />
            </Table.Td>
            <Table.Td>
              <Tooltip label="Apagar">
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => onDelete(alert.id)}
                  aria-label="Apagar alerta"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** The rule's kind (badge) and its sentence. */
function RuleCell({ alert }: { alert: AlertDto }) {
  return (
    <Stack gap={2}>
      <Badge size="xs" variant="light" w="fit-content">
        {ALERT_TYPE_OPTIONS.find((option) => option.value === alert.type)?.label ?? alert.type}
      </Badge>
      <Text size="sm">{describeAlert(alert)}</Text>
    </Stack>
  );
}

/** The "Meus alertas" card: loading, error, empty or the table. */
export function MyAlertsCard({
  query,
  onToggle,
  onDelete,
}: {
  query: UseQueryResult<AlertDto[]>;
  onToggle: (alert: AlertDto, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card p="md">
      <Text fw={700} mb="sm">
        Meus alertas
      </Text>
      {query.isLoading ? (
        <Loading rows={3} />
      ) : query.error ? (
        <ErrorView error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <NoData title="Nenhum alerta">Crie uma regra acima.</NoData>
      ) : (
        <AlertsTable alerts={query.data} onToggle={onToggle} onDelete={onDelete} />
      )}
    </Card>
  );
}
