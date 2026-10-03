import { Alert, Button, Center, Group, Skeleton, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconAlertTriangle, IconDatabaseOff, IconRefresh } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ApiError } from "../../api/client";

export function Carregando({ linhas = 4, altura }: { linhas?: number; altura?: number | string }) {
  if (altura) return <Skeleton h={altura} radius="md" />;
  return (
    <Stack gap="xs" p="xs" aria-busy="true" aria-label="Carregando">
      <Skeleton h={18} w="45%" radius="sm" />
      {Array.from({ length: linhas }, (_, i) => (
        <Group key={i} gap="sm" wrap="nowrap">
          <Skeleton circle h={32} w={32} />
          <Stack gap={6} style={{ flex: 1 }}>
            <Skeleton h={10} w={`${70 - i * 8}%`} radius="sm" />
            <Skeleton h={8} radius="xl" />
          </Stack>
        </Group>
      ))}
    </Stack>
  );
}

export function SemDados({ titulo = "Sem dados ainda", children }: { titulo?: string; children?: ReactNode }) {
  return (
    <Center py="lg" px="sm" h="100%">
      <Stack align="center" gap={6} maw={360}>
        <ThemeIcon variant="light" color="gray" size={42} radius="xl">
          <IconDatabaseOff size={22} />
        </ThemeIcon>
        <Text fw={600} ta="center">
          {titulo}
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          {children ?? "O TSE ainda não publicou resultados para este recorte. Os números aparecem aqui assim que chegarem."}
        </Text>
      </Stack>
    </Center>
  );
}

export function ErroView({ erro, onRetry, compacto }: { erro: unknown; onRetry?: () => void; compacto?: boolean }) {
  const msg = erro instanceof ApiError ? erro.message : erro instanceof Error ? erro.message : "Erro inesperado.";
  const status = erro instanceof ApiError ? erro.status : null;
  if (compacto)
    return (
      <Group gap={6} p="xs" wrap="nowrap">
        <IconAlertTriangle size={16} color="var(--mantine-color-red-5)" />
        <Text size="sm" c="red.5" lineClamp={2}>
          {msg}
        </Text>
        {onRetry && (
          <Button size="compact-xs" variant="subtle" onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
      </Group>
    );
  return (
    <Alert
      variant="light"
      color="red"
      title={status === 404 ? "Não encontrado" : "Não foi possível carregar"}
      icon={<IconAlertTriangle />}
      m="xs"
    >
      <Stack gap="xs">
        <Text size="sm">{msg}</Text>
        {onRetry && (
          <Button size="xs" variant="light" color="red" leftSection={<IconRefresh size={14} />} onClick={onRetry} w="fit-content">
            Tentar de novo
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
