import { Alert, Badge, Button, Card, FileButton, Group, Modal, SimpleGrid, Stack, Text, TextInput, ThemeIcon, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileImport, IconLayoutDashboard, IconSquarePlus } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RecortePicker, lerRecorte } from "../components/common/Pickers";
import { useFiltro } from "../store/filtro";
import { usePaineis } from "./repo";
import { SCHEMA_VERSION, arquivoPainelZ, configPainelZ, descreverErroZod, type ConfigPainel } from "./schema";
import { TEMPLATES, type Template } from "./templates";

const BRANCO: Template = {
  id: "branco",
  nome: "Painel em branco",
  descricao: "Comece do zero e adicione widgets do catálogo.",
  criar: () => ({
    schemaVersion: SCHEMA_VERSION,
    filtroGlobal: { ...filtroAtual(), tempo: "agora" },
    widgets: [],
  }),
};

function filtroAtual() {
  const f = useFiltro.getState();
  return { ambiente: "oficial", ciclo: f.ciclo ?? "ele2026", turno: f.turno, cargo: f.cargo, nivel: f.nivel, recorte: f.id };
}

/** Lê e valida um arquivo exportado (formato completo ou só a config). */
export function lerArquivoPainel(texto: string): { nome: string; config: ConfigPainel } {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }
  const completo = arquivoPainelZ.safeParse(json);
  if (completo.success) return { nome: completo.data.nome, config: completo.data.config };
  const soConfig = configPainelZ.safeParse(json);
  if (soConfig.success) return { nome: soConfig.data.nome ?? "Painel importado", config: soConfig.data };
  throw new Error(`Arquivo de painel inválido: ${descreverErroZod(completo.error)}`);
}

export function NovoPainelModal({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { criar } = usePaineis();
  const navigate = useNavigate();
  const [sel, setSel] = useState<Template | null>(null);
  const [nome, setNome] = useState("");
  const [recorte, setRecorte] = useState<string | null>(null);
  const [rotulo, setRotulo] = useState<string | undefined>();
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const fechar = () => {
    setSel(null);
    setNome("");
    setRecorte(null);
    setErro(null);
    onClose();
  };

  const confirmar = async () => {
    if (!sel) return;
    if (sel.pede && !recorte) {
      setErro("Escolha o recorte para este template.");
      return;
    }
    setCriando(true);
    try {
      const r = lerRecorte(recorte);
      const cfg = sel.criar({ nivel: r?.nivel, recorte: r?.id, nome: rotulo, turno: useFiltro.getState().turno });
      const p = await criar(nome.trim() || cfg.nome || sel.nome, cfg);
      notifications.show({ color: "teal", title: "Painel criado", message: p.nome });
      fechar();
      navigate(`/paineis/${p.id}`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCriando(false);
    }
  };

  const importar = async (f: File | null) => {
    if (!f) return;
    try {
      const { nome: n, config } = lerArquivoPainel(await f.text());
      const p = await criar(n, config, false);
      notifications.show({ color: "teal", title: "Painel importado", message: p.nome });
      fechar();
      navigate(`/paineis/${p.id}`);
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <Modal opened={aberto} onClose={fechar} size="xl" title={<Text fw={700}>Novo painel</Text>}>
      <Stack>
        <Text size="sm" c="dimmed">
          Escolha um template para começar. Tudo pode ser personalizado depois.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
          {[...TEMPLATES, BRANCO].map((t) => (
            <UnstyledButton key={t.id} onClick={() => { setSel(t); setErro(null); setRecorte(null); }}>
              <Card withBorder p="sm" h="100%" style={{ borderColor: sel?.id === t.id ? "var(--mantine-color-eleicao-4)" : undefined }}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <ThemeIcon size="lg" variant={sel?.id === t.id ? "filled" : "light"} radius="md">
                    {t.id === "branco" ? <IconSquarePlus size={18} /> : <IconLayoutDashboard size={18} />}
                  </ThemeIcon>
                  <Stack gap={2}>
                    <Text fw={700} size="sm">
                      {t.nome}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t.descricao}
                    </Text>
                    {t.pede && (
                      <Badge size="xs" variant="light" mt={4}>
                        escolha {t.pede === "uf" ? "a UF" : t.pede === "municipio" ? "o município" : "o local"}
                      </Badge>
                    )}
                  </Stack>
                </Group>
              </Card>
            </UnstyledButton>
          ))}
        </SimpleGrid>
        {sel && (
          <Card withBorder p="sm">
            <Stack gap="sm">
              <TextInput label="Nome do painel" placeholder={sel.nome} value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
              {sel.pede && (
                <RecortePicker
                  label={sel.pede === "uf" ? "UF" : sel.pede === "municipio" ? "Município" : "Local de votação"}
                  tipos={[sel.pede]}
                  incluirBrasil={false}
                  incluirUfs={sel.pede === "uf"}
                  value={recorte}
                  onChange={(v, n) => {
                    setRecorte(v);
                    setRotulo(n);
                  }}
                />
              )}
            </Stack>
          </Card>
        )}
        {erro && (
          <Alert color="red" variant="light">
            {erro}
          </Alert>
        )}
        <Group justify="space-between">
          <FileButton onChange={importar} accept="application/json,.json">
            {(props) => (
              <Button variant="subtle" leftSection={<IconFileImport size={16} />} {...props}>
                Importar JSON
              </Button>
            )}
          </FileButton>
          <Group>
            <Button variant="default" onClick={fechar}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!sel} loading={criando}>
              Criar painel
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
