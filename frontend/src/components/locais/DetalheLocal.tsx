import { Anchor, Badge, Box, Group, ScrollArea, SimpleGrid, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconMapPin } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useLocal } from "../../api/hooks";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { COR_STATUS, ROTULO_STATUS } from "../../lib/cores";
import { fmtInt } from "../../lib/format";
import { fmtHora } from "../../lib/time";
import { Carregando, ErroView, SemDados } from "../common/Estados";
import { MapaEleitoral } from "../mapas";
import type { StatusApuracao } from "../../api/types";

export function BadgeStatus({ s }: { s: StatusApuracao }) {
  return (
    <Badge size="sm" variant="light" color={s === "apurado" ? "green" : s === "parcial" ? "yellow" : "gray"} leftSection={<Box w={6} h={6} style={{ borderRadius: 6, background: COR_STATUS[s] }} />}>
      {ROTULO_STATUS[s]}
    </Badge>
  );
}

export function DetalheLocal({ localId, mapa = true, alturaLista }: { localId: string | null | undefined; mapa?: boolean; alturaLista?: number | string }) {
  const f = useFiltroEfetivo();
  const q = useLocal(localId, f.turno);
  if (!localId) return <SemDados titulo="Escolha um local de votação">Use a busca (Ctrl+K) ou configure o widget.</SemDados>;
  if (q.isLoading) return <Carregando linhas={4} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  const l = q.data;
  if (!l) return <SemDados />;
  const apuradas = l.secoes.filter((s) => s.status === "apurado").length;
  return (
    <Stack gap="sm">
      <Stack gap={2}>
        <Text fw={800} size="lg" lh={1.2}>
          {l.nome}
        </Text>
        <Group gap={4} wrap="nowrap">
          <IconMapPin size={14} style={{ flexShrink: 0 }} />
          <Text size="sm" c="dimmed">
            {[l.endereco, l.bairro, l.cep].filter(Boolean).join(" · ") || "Endereço não informado"}
            {l.aproximado ? " (posição aproximada)" : ""}
          </Text>
        </Group>
        <Text size="sm">
          <Anchor component={Link} to={`/explorar/municipio/${l.municipio.id}`}>
            {l.municipio.nome}
          </Anchor>{" "}
          ·{" "}
          <Anchor component={Link} to={`/explorar/zona/${l.zona.id}`}>
            Zona {l.zona.numero}
          </Anchor>{" "}
          · <span className="num">{fmtInt(l.eleitores_aptos)}</span> eleitores aptos
        </Text>
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: mapa ? 2 : 1 }} spacing="sm">
        {mapa && (
          <Box h={220} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--mantine-color-default-border)" }}>
            <MapaEleitoral tipo="locais" nivel="local" id={l.id} legenda={false} altura={220} />
          </Box>
        )}
        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="sm" fw={700}>
              Seções ({l.secoes.length})
            </Text>
            <Text size="xs" c="dimmed">
              {apuradas} de {l.secoes.length} apuradas
            </Text>
          </Group>
          <ScrollArea.Autosize mah={alturaLista ?? 260} className="scroll-fino">
            <Table verticalSpacing={4} highlightOnHover fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Seção</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th ta="right">Aptos</Table.Th>
                  <Table.Th ta="right">Comparec.</Table.Th>
                  <Table.Th ta="right">BU</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[...l.secoes]
                  .sort((a, b) => a.numero - b.numero)
                  .map((s) => (
                    <Table.Tr key={s.id}>
                      <Table.Td>
                        <Anchor component={Link} to={`/secoes/${s.id}`} fw={700} className="num">
                          {s.numero}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        <BadgeStatus s={s.status} />
                      </Table.Td>
                      <Table.Td ta="right" className="num">
                        {fmtInt(s.eleitores_aptos)}
                      </Table.Td>
                      <Table.Td ta="right" className="num">
                        {fmtInt(s.comparecimento)}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Tooltip label="Horário de totalização do boletim de urna (Brasília)">
                          <Text size="xs" className="num" c="dimmed">
                            {fmtHora(s.totalizado_em, false)}
                          </Text>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
