import { Button, Card, ColorInput, Group, MultiSelect, ScrollArea, SegmentedControl, Stack, Switch, Table, Text, Title } from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useCandidatos } from "../api/hooks";
import { AvatarCandidato } from "../components/resultados/AvatarCandidato";
import { TIPOS_EVENTO } from "../components/eventos/FeedEventos";
import { NOME_CARGO } from "../lib/cargos";
import { PALETA } from "../lib/cores";
import { ufDoId } from "../lib/recortes";
import { useAuth } from "../store/auth";
import { useFiltro } from "../store/filtro";
import { PREFS_PADRAO, usePrefs, type Densidade, type Tema } from "../store/prefs";
import { useUi } from "../store/ui";

function CoresCandidatos() {
  const f = useFiltro();
  const q = useCandidatos(f.turno, f.cargo, f.cargo === 1 ? null : ufDoId(f.nivel, f.id) ?? "sp");
  const cores = usePrefs((s) => s.coresCandidatos);
  const setCor = usePrefs((s) => s.setCor);
  return (
    <Card p="md">
      <Group justify="space-between" mb="xs">
        <Stack gap={0}>
          <Text fw={700}>Cor por candidato</Text>
          <Text size="xs" c="dimmed">
            {NOME_CARGO[f.cargo]} · paleta neutra por padrão. Vale para todos os placares, mapas e gráficos.
          </Text>
        </Stack>
        <Button size="xs" variant="subtle" leftSection={<IconRestore size={14} />} onClick={() => usePrefs.getState().set({ coresCandidatos: {} })}>
          Restaurar padrão
        </Button>
      </Group>
      <ScrollArea.Autosize mah={420} className="scroll-fino">
        <Table verticalSpacing={4}>
          <Table.Tbody>
            {(q.data ?? []).slice(0, 80).map((c) => (
              <Table.Tr key={c.sqcand}>
                <Table.Td w={50}>
                  <AvatarCandidato fotoUrl={c.foto_url} nome={c.nome_urna} cor={cores[c.sqcand] ?? c.cor} size={32} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {c.nome_urna} ({c.numero})
                  </Text>
                  <Text size="xs" c="dimmed">
                    {c.partido_sigla}
                  </Text>
                </Table.Td>
                <Table.Td w={170}>
                  <ColorInput size="xs" value={cores[c.sqcand] ?? c.cor} onChange={(v) => setCor(c.sqcand, v || null)} swatches={PALETA} swatchesPerRow={6} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Card>
  );
}

export default function ContaPage() {
  const p = usePrefs();
  const usuario = useAuth((s) => s.usuario);
  const setAuth = useUi((s) => s.setAuthAberto);
  return (
    <Stack gap="md" maw={900} mx="auto">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          {usuario ? `${usuario.nome} · ${usuario.email}` : "Sem login (preferências salvas neste navegador)"}
        </Text>
        <Title order={2}>Preferências</Title>
      </Stack>
      {!usuario && (
        <Button w="fit-content" variant="light" onClick={() => setAuth(true)}>
          Entrar para sincronizar preferências
        </Button>
      )}
      <Card p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Tema</Text>
            <SegmentedControl
              value={p.tema}
              onChange={(v) => p.set({ tema: v as Tema })}
              data={[
                { value: "escuro", label: "Noite da eleição" },
                { value: "claro", label: "Claro" },
                { value: "auto", label: "Automático" },
              ]}
            />
          </Group>
          <Group justify="space-between">
            <Text fw={600}>Densidade</Text>
            <SegmentedControl
              value={p.densidade}
              onChange={(v) => p.set({ densidade: v as Densidade })}
              data={[
                { value: "confortavel", label: "Confortável" },
                { value: "compacta", label: "Compacta" },
              ]}
            />
          </Group>
          <Switch label="Animações (números que rolam, ranking que reordena, brilho nas mudanças)" checked={p.animacoes} onChange={(e) => p.set({ animacoes: e.currentTarget.checked })} />
          <Switch label="Mapa de fundo (ruas e rótulos) nos mapas" checked={p.basemap} onChange={(e) => p.set({ basemap: e.currentTarget.checked })} />
          <MultiSelect label="Toasts para eventos" data={TIPOS_EVENTO} value={p.toasts} onChange={(v) => p.set({ toasts: v })} clearable />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconRestore size={14} />}
              onClick={() => p.set({ ...PREFS_PADRAO, coresCandidatos: p.coresCandidatos })}
            >
              Restaurar preferências
            </Button>
          </Group>
        </Stack>
      </Card>
      <CoresCandidatos />
    </Stack>
  );
}
