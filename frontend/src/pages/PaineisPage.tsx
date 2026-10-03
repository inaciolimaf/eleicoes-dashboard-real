import { ActionIcon, Alert, Badge, Button, Card, FileButton, Group, Menu, SimpleGrid, Stack, Text, Title, Tooltip } from "@mantine/core";
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
import { Carregando, ErroView } from "../components/common/Estados";
import { usePaineis } from "../paineis/repo";
import { NovoPainelModal, lerArquivoPainel } from "../paineis/NovoPainelModal";
import { REGISTRO } from "../widgets/registro";
import { baixarJson } from "../lib/exportar";
import { slug } from "../lib/format";
import { fmtDataCurta } from "../lib/time";
import { SCHEMA_VERSION } from "../paineis/schema";

export default function PaineisPage() {
  const repo = usePaineis();
  const navigate = useNavigate();
  const [novo, setNovo] = useState(false);
  if (repo.carregando) return <Carregando linhas={5} />;
  if (repo.erro) return <ErroView erro={repo.erro} />;
  const mover = (i: number, d: -1 | 1) => {
    const ids = repo.paineis.map((p) => p.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    repo.reordenar(ids);
  };
  const importar = async (f: File | null) => {
    if (!f) return;
    try {
      const { nome, config } = lerArquivoPainel(await f.text());
      const p = await repo.criar(nome, config, false);
      notifications.show({ color: "teal", title: "Painel importado", message: p.nome });
    } catch (e) {
      notifications.show({ color: "red", title: "Falha ao importar", message: (e as Error).message });
    }
  };
  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Stack gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Personalização
          </Text>
          <Title order={2}>Meus painéis</Title>
        </Stack>
        <Group gap="xs">
          <FileButton onChange={importar} accept="application/json,.json">
            {(p) => (
              <Button variant="default" leftSection={<IconFileImport size={16} />} {...p}>
                Importar JSON
              </Button>
            )}
          </FileButton>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setNovo(true)}>
            Novo painel
          </Button>
        </Group>
      </Group>
      {!repo.logado && (
        <Alert variant="light" color="blue">
          Sem login, os painéis ficam salvos neste navegador. Entre na sua conta para levá-los a outros dispositivos e compartilhar.
        </Alert>
      )}
      {repo.locaisPendentes > 0 && (
        <Alert variant="light" color="teal" icon={<IconCloudUpload />} title="Painéis deste navegador">
          <Group justify="space-between">
            <Text size="sm">Há {repo.locaisPendentes} painel(is) salvo(s) só neste navegador.</Text>
            <Button
              size="xs"
              onClick={async () => {
                const n = await repo.migrarLocais();
                notifications.show({ color: "teal", message: `${n} painel(is) enviados para a sua conta.` });
              }}
            >
              Enviar painéis locais para a conta
            </Button>
          </Group>
        </Alert>
      )}
      {repo.paineis.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <IconLayoutDashboard size={40} opacity={0.5} />
            <Text>Você ainda não tem painéis.</Text>
            <Button onClick={() => setNovo(true)}>Criar a partir de um template</Button>
          </Stack>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {repo.paineis.map((p, i) => (
            <Card key={p.id} p="md">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    {p.padrao && <IconStarFilled size={14} color="var(--mantine-color-yellow-5)" />}
                    <Text fw={700} component={Link} to={`/paineis/${p.id}`} c="inherit" lineClamp={1} style={{ textDecoration: "none" }}>
                      {p.nome}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {p.config.widgets.length} widgets · atualizado {fmtDataCurta(p.atualizado_em)}
                  </Text>
                  <Group gap={4}>
                    {[...new Set(p.config.widgets.map((w) => w.tipo))].slice(0, 5).map((t) => (
                      <Badge key={t} size="xs" variant="light" color="gray">
                        {REGISTRO[t].nome}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
                <Group gap={2} wrap="nowrap">
                  <Tooltip label="Mover para cima">
                    <ActionIcon variant="subtle" size="sm" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Mover para cima">
                      <IconArrowUp size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Mover para baixo">
                    <ActionIcon variant="subtle" size="sm" disabled={i === repo.paineis.length - 1} onClick={() => mover(i, 1)} aria-label="Mover para baixo">
                      <IconArrowDown size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <ActionIcon variant="subtle" size="sm" aria-label="Opções">
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconStar size={14} />} disabled={p.padrao} onClick={() => repo.definirPadrao(p.id)}>
                        Definir como padrão
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconCopy size={14} />}
                        onClick={async () => {
                          const n = await repo.criar(`${p.nome} (cópia)`, p.config, false);
                          navigate(`/paineis/${n.id}`);
                        }}
                      >
                        Duplicar
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconDownload size={14} />}
                        onClick={() => baixarJson({ formato: "eleicoes-dashboard/painel", schemaVersion: SCHEMA_VERSION, nome: p.nome, config: p.config }, `painel-${slug(p.nome)}.json`)}
                      >
                        Exportar JSON
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() =>
                          modals.openConfirmModal({
                            title: "Apagar painel",
                            children: <Text size="sm">Apagar “{p.nome}”?</Text>,
                            labels: { confirm: "Apagar", cancel: "Cancelar" },
                            confirmProps: { color: "red" },
                            onConfirm: () => repo.apagar(p.id),
                          })
                        }
                      >
                        Apagar
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Group>
              <Button component={Link} to={`/paineis/${p.id}`} variant="light" mt="md" fullWidth>
                Abrir
              </Button>
            </Card>
          ))}
        </SimpleGrid>
      )}
      <NovoPainelModal aberto={novo} onClose={() => setNovo(false)} />
    </Stack>
  );
}
