import { Badge, Box, Button, Card, Drawer, Group, ScrollArea, SimpleGrid, Stack, Text, TextInput, ThemeIcon, UnstyledButton } from "@mantine/core";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { semAcento } from "../lib/format";
import { CATALOGO } from "../widgets/registro";
import type { TipoWidget } from "./schema";
import { WidgetFrame } from "./WidgetFrame";

/** Gaveta "Adicionar widget": catálogo com busca e preview ao vivo. */
export function GavetaWidgets({ aberta, onClose, onAdicionar }: { aberta: boolean; onClose: () => void; onAdicionar: (t: TipoWidget) => void }) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<TipoWidget>("placar");
  const lista = useMemo(() => {
    const b = semAcento(busca.trim());
    return CATALOGO.filter((d) => !b || semAcento(`${d.nome} ${d.descricao}`).includes(b));
  }, [busca]);
  const def = CATALOGO.find((d) => d.tipo === sel) ?? CATALOGO[0];
  return (
    <Drawer opened={aberta} onClose={onClose} position="right" size="xl" title={<Text fw={700}>Adicionar widget</Text>}>
      <Stack gap="sm">
        <TextInput placeholder="Buscar no catálogo…" leftSection={<IconSearch size={14} />} value={busca} onChange={(e) => setBusca(e.currentTarget.value)} data-autofocus />
        <Card withBorder p="xs" radius="lg">
          <Group justify="space-between" mb={6}>
            <Group gap={6}>
              <ThemeIcon variant="light" size="sm">
                <def.icone size={14} />
              </ThemeIcon>
              <Text fw={700} size="sm">
                Pré-visualização: {def.nome}
              </Text>
            </Group>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => onAdicionar(def.tipo)}>
              Adicionar
            </Button>
          </Group>
          <Box h={280} style={{ pointerEvents: "auto" }}>
            {aberta && (
              <WidgetFrame
                key={def.tipo}
                widget={{ id: `preview-${def.tipo}`, tipo: def.tipo, pos: { x: 0, y: 0, ...def.tamanho }, herda: true, config: { ...def.padrao } }}
                editando={false}
              />
            )}
          </Box>
        </Card>
        <ScrollArea.Autosize mah="calc(100vh - 470px)" className="scroll-fino">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            {lista.map((d, i) => (
              <UnstyledButton key={d.tipo} onClick={() => setSel(d.tipo)} onDoubleClick={() => onAdicionar(d.tipo)}>
                <Card
                  withBorder
                  p="xs"
                  radius="md"
                  style={{ borderColor: sel === d.tipo ? "var(--mantine-color-eleicao-4)" : undefined, height: "100%" }}
                >
                  <Group gap="sm" wrap="nowrap" align="flex-start">
                    <ThemeIcon variant={sel === d.tipo ? "filled" : "light"} size="lg" radius="md">
                      <d.icone size={18} />
                    </ThemeIcon>
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Group gap={4}>
                        <Text fw={700} size="sm">
                          {d.nome}
                        </Text>
                        <Badge size="xs" variant="outline" color="gray">
                          {i + 1}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {d.descricao}
                      </Text>
                    </Stack>
                  </Group>
                </Card>
              </UnstyledButton>
            ))}
          </SimpleGrid>
        </ScrollArea.Autosize>
      </Stack>
    </Drawer>
  );
}
