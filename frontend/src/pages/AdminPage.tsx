import { Alert, Badge, Button, Card, Code, Collapse, Group, NumberInput, Paper, SegmentedControl, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconClockPlay, IconPlayerPauseFilled, IconPlayerPlayFilled, IconRefresh, IconShieldLock } from "@tabler/icons-react";
import { useState } from "react";
import { useAdminAcao, useAdminFake, useAdminSaude, useStatus } from "../api/hooks";
import { Carregando, ErroView } from "../components/common/Estados";
import { fmtNum } from "../lib/format";
import { dayjs, fmtDataHora } from "../lib/time";
import { useAuth } from "../store/auth";

const ehIso = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);
const rotulo = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function Valor({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <Text c="dimmed">—</Text>;
  if (typeof v === "boolean") return <Badge color={v ? "teal" : "gray"} variant="light">{v ? "sim" : "não"}</Badge>;
  if (typeof v === "number") return <Text fw={700} className="num" fz="lg">{fmtNum(v, 2)}</Text>;
  if (ehIso(v)) return <Text className="num">{fmtDataHora(v as string)}</Text>;
  if (typeof v === "string") return <Text fw={600}>{v}</Text>;
  return <Code block style={{ maxHeight: 180, overflow: "auto" }}>{JSON.stringify(v, null, 2)}</Code>;
}

/** Renderiza métricas genéricas (o formato exato de /admin/saude é livre no contrato). */
function Metricas({ dados }: { dados: Record<string, unknown> }) {
  const simples = Object.entries(dados).filter(([, v]) => v === null || typeof v !== "object");
  const grupos = Object.entries(dados).filter(([, v]) => v !== null && typeof v === "object" && !Array.isArray(v)) as [string, Record<string, unknown>][];
  const listas = Object.entries(dados).filter(([, v]) => Array.isArray(v));
  return (
    <Stack gap="md">
      {simples.length > 0 && (
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
          {simples.map(([k, v]) => (
            <Paper key={k} withBorder p="sm">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                {rotulo(k)}
              </Text>
              <Valor v={v} />
            </Paper>
          ))}
        </SimpleGrid>
      )}
      {grupos.map(([k, v]) => (
        <Card key={k} p="sm" withBorder>
          <Text fw={700} mb="xs">
            {rotulo(k)}
          </Text>
          <Metricas dados={v} />
        </Card>
      ))}
      {listas.map(([k, v]) => (
        <Card key={k} p="sm" withBorder>
          <Text fw={700} mb="xs">
            {rotulo(k)}
          </Text>
          <Valor v={v} />
        </Card>
      ))}
    </Stack>
  );
}

export default function AdminPage() {
  const usuario = useAuth((s) => s.usuario);
  const admin = !!usuario?.is_admin;
  const saude = useAdminSaude(admin);
  const fake = useAdminFake(admin);
  const status = useStatus();
  const acao = useAdminAcao();
  const [vel, setVel] = useState<number>(60);
  const [irPara, setIrPara] = useState<Date | null>(null);
  const [bruto, { toggle }] = useDisclosure(false);

  if (!admin)
    return (
      <Alert color="red" variant="light" icon={<IconShieldLock />} title="Acesso restrito" maw={600} mx="auto">
        Esta página é só para administradores. O primeiro usuário registrado vira admin.
      </Alert>
    );

  const executar = async (a: Parameters<typeof acao.mutateAsync>[0], ok: string) => {
    try {
      await acao.mutateAsync(a);
      notifications.show({ color: "teal", message: ok });
    } catch (e) {
      notifications.show({ color: "red", title: "Falha", message: (e as Error).message });
    }
  };

  const pausado = status.data?.coletor.pausado;
  const fakeDados = fake.data ?? {};
  const fakePausado = fakeDados.pausado === true;
  const ambienteFake = status.data?.ambiente === "fake";

  return (
    <Stack gap="md">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          Administração
        </Text>
        <Title order={2}>Saúde do sistema</Title>
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card p="md">
          <Group justify="space-between" mb="sm">
            <Text fw={700}>Coletor do TSE</Text>
            <Badge color={pausado ? "yellow" : "teal"} variant="light">
              {pausado ? "pausado" : "rodando"} · {fmtNum(status.data?.coletor.req_por_seg ?? 0, 1)} req/s
            </Badge>
          </Group>
          <Group>
            <Button
              color="yellow"
              variant={pausado ? "default" : "filled"}
              leftSection={<IconPlayerPauseFilled size={16} />}
              disabled={pausado}
              onClick={() => executar({ tipo: "pausar" }, "Coletor pausado")}
            >
              Pausar
            </Button>
            <Button
              color="teal"
              variant={pausado ? "filled" : "default"}
              leftSection={<IconPlayerPlayFilled size={16} />}
              disabled={!pausado}
              onClick={() => executar({ tipo: "retomar" }, "Coletor retomado")}
            >
              Retomar
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt="sm">
            Última coleta: {fmtDataHora(status.data?.ultima_coleta)} · última totalização: {fmtDataHora(status.data?.ultima_totalizacao)}
          </Text>
        </Card>

        <Card p="md">
          <Group justify="space-between" mb="sm">
            <Text fw={700}>Relógio do TSE simulado (tse-fake)</Text>
            {!ambienteFake && (
              <Badge color="gray" variant="light">
                ambiente {status.data?.ambiente ?? "?"}
              </Badge>
            )}
          </Group>
          {fake.error ? (
            <Text size="sm" c="dimmed">
              Indisponível ({(fake.error as Error).message}). Só funciona no ambiente “fake”.
            </Text>
          ) : (
            <Stack gap="sm">
              <SimpleGrid cols={2} spacing="xs">
                {Object.entries(fakeDados)
                  .filter(([, v]) => v === null || typeof v !== "object")
                  .map(([k, v]) => (
                    <Paper key={k} withBorder p={6}>
                      <Text fz={10} c="dimmed" tt="uppercase" fw={600}>
                        {rotulo(k)}
                      </Text>
                      <Valor v={v} />
                    </Paper>
                  ))}
              </SimpleGrid>
              <Group align="flex-end" gap="xs">
                <SegmentedControl size="xs" value={String(vel)} onChange={(v) => setVel(Number(v))} data={["1", "10", "60", "300"].map((v) => ({ value: v, label: `${v}×` }))} />
                <NumberInput size="xs" w={90} value={vel} onChange={(v) => setVel(Number(v) || 1)} min={0.1} max={10000} aria-label="Velocidade" />
                <Button size="xs" onClick={() => executar({ tipo: "fake", body: { velocidade: vel } }, `Velocidade ${vel}×`)}>
                  Aplicar velocidade
                </Button>
              </Group>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  color={fakePausado ? "teal" : "yellow"}
                  leftSection={fakePausado ? <IconPlayerPlayFilled size={14} /> : <IconPlayerPauseFilled size={14} />}
                  onClick={() => executar({ tipo: "fake", body: { pausado: !fakePausado } }, fakePausado ? "Relógio retomado" : "Relógio pausado")}
                >
                  {fakePausado ? "Retomar relógio" : "Pausar relógio"}
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  leftSection={<IconRefresh size={14} />}
                  onClick={() =>
                    modals.openConfirmModal({
                      title: "Reiniciar a simulação",
                      children: <Text size="sm">O relógio do tse-fake volta ao início da noite gravada.</Text>,
                      labels: { confirm: "Reiniciar", cancel: "Cancelar" },
                      confirmProps: { color: "red" },
                      onConfirm: () => executar({ tipo: "fake", body: { reiniciar: true } }, "Simulação reiniciada"),
                    })
                  }
                >
                  Reiniciar
                </Button>
              </Group>
              <Group align="flex-end" gap="xs">
                <DateTimePicker size="xs" label="Ir para (horário de Brasília)" value={irPara} onChange={setIrPara} valueFormat="DD/MM/YYYY HH:mm" w={220} clearable />
                <Button
                  size="xs"
                  leftSection={<IconClockPlay size={14} />}
                  disabled={!irPara}
                  onClick={() => irPara && executar({ tipo: "fake", body: { ir_para: dayjs(irPara).toISOString() } }, "Relógio reposicionado")}
                >
                  Ir
                </Button>
              </Group>
            </Stack>
          )}
        </Card>
      </SimpleGrid>

      <Card p="md">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>Métricas do coletor e do worker</Text>
          <Button size="xs" variant="subtle" onClick={toggle}>
            {bruto ? "Ocultar JSON" : "Ver JSON bruto"}
          </Button>
        </Group>
        {saude.isLoading ? <Carregando linhas={4} /> : saude.error ? <ErroView erro={saude.error} onRetry={() => saude.refetch()} /> : saude.data ? <Metricas dados={saude.data} /> : null}
        <Collapse in={bruto}>
          <Code block mt="sm">
            {JSON.stringify(saude.data, null, 2)}
          </Code>
        </Collapse>
      </Card>
    </Stack>
  );
}
