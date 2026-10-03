import { Anchor, Badge, Box, Button, Code, CopyButton, Group, ScrollArea, SimpleGrid, Stack, Table, Tabs, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy, IconDownload, IconShieldCheck, IconShieldQuestion, IconShieldX } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useSecao } from "../../api/hooks";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { fmtDataHora, fmtHora } from "../../lib/time";
import { fmtInt, fmtPct } from "../../lib/format";
import { useCorCandidato } from "../../lib/useCor";
import { Carregando, ErroView, SemDados } from "../common/Estados";
import { BadgeStatus } from "../locais/DetalheLocal";

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {rotulo}
      </Text>
      <Box fz="sm">{children}</Box>
    </Stack>
  );
}

export function DetalheSecao({ secaoId, compacto }: { secaoId: string | null | undefined; compacto?: boolean }) {
  const f = useFiltroEfetivo();
  const q = useSecao(secaoId, f.turno);
  const corCand = useCorCandidato();
  if (!secaoId) return <SemDados titulo="Escolha uma seção">Use a busca (Ctrl+K) ou configure o widget.</SemDados>;
  if (q.isLoading) return <Carregando linhas={4} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  if (!s) return <SemDados />;
  const assinatura =
    s.assinatura_ok === true ? (
      <Badge color="teal" variant="light" leftSection={<IconShieldCheck size={12} />}>
        Assinatura válida
      </Badge>
    ) : s.assinatura_ok === false ? (
      <Badge color="red" variant="light" leftSection={<IconShieldX size={12} />}>
        Assinatura inválida
      </Badge>
    ) : (
      <Badge color="gray" variant="light" leftSection={<IconShieldQuestion size={12} />}>
        Não verificada
      </Badge>
    );
  const cargoInicial = s.cargos.find((c) => Number(c.cd) === f.cargo)?.cd ?? s.cargos[0]?.cd;
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text fw={800} size="lg">
            Seção <span className="num">{s.numero}</span>
          </Text>
          <Text size="sm">
            <Anchor component={Link} to={`/locais/${s.local.id}`}>
              {s.local.nome}
            </Anchor>{" "}
            ·{" "}
            <Anchor component={Link} to={`/explorar/zona/${s.zona.id}`}>
              Zona {s.zona.numero}
            </Anchor>{" "}
            ·{" "}
            <Anchor component={Link} to={`/explorar/municipio/${s.municipio.id}`}>
              {s.municipio.nome}/{s.uf.toUpperCase()}
            </Anchor>
          </Text>
        </Stack>
        <Group gap={6}>
          <BadgeStatus s={s.status} />
          {assinatura}
        </Group>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: compacto ? 2 : 4 }} spacing="sm">
        <Info rotulo="Eleitores aptos">
          <span className="num">{fmtInt(s.eleitores_aptos)}</span>
        </Info>
        <Info rotulo="Comparecimento">
          <span className="num">{fmtInt(s.comparecimento)}</span>{" "}
          <Text span c="dimmed" size="xs">
            ({s.comparecimento != null && s.eleitores_aptos ? fmtPct((s.comparecimento / s.eleitores_aptos) * 100, 1) : "—"})
          </Text>
        </Info>
        <Info rotulo="BU emitido (urna)">
          <span className="num">{fmtDataHora(s.emitido_em)}</span>
        </Info>
        <Info rotulo="Totalizado">
          <span className="num">{fmtHora(s.totalizado_em)}</span>
        </Info>
      </SimpleGrid>
      {!compacto && (
        <Group gap="xs" wrap="nowrap" align="center">
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
            Hash
          </Text>
          <Code style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.hash ?? "—"}</Code>
          {s.hash && (
            <CopyButton value={s.hash}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copiado" : "Copiar hash"}>
                  <Button size="compact-xs" variant="subtle" onClick={copy}>
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </Button>
                </Tooltip>
              )}
            </CopyButton>
          )}
          {s.url_bu && (
            <Button size="compact-xs" variant="light" component="a" href={s.url_bu} target="_blank" rel="noopener" leftSection={<IconDownload size={12} />}>
              BU bruto (TSE)
            </Button>
          )}
        </Group>
      )}
      {s.cargos.length === 0 ? (
        <SemDados titulo="Boletim de urna ainda não coletado" />
      ) : (
        <Tabs defaultValue={String(cargoInicial)} variant="outline">
          <ScrollArea type="never">
            <Tabs.List style={{ flexWrap: "nowrap" }}>
              {s.cargos.map((c) => (
                <Tabs.Tab key={String(c.cd)} value={String(c.cd)}>
                  {c.nome}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </ScrollArea>
          {s.cargos.map((c) => {
            const votos = [...c.votos].sort((a, b) => b.votos - a.votos);
            const max = votos[0]?.votos ?? 1;
            return (
              <Tabs.Panel key={String(c.cd)} value={String(c.cd)} pt="xs">
                <Group gap="lg" mb="xs">
                  <Text size="sm">
                    Válidos <b className="num">{fmtInt(c.votos_validos)}</b>
                  </Text>
                  <Text size="sm">
                    Brancos <b className="num">{fmtInt(c.brancos)}</b>
                  </Text>
                  <Text size="sm">
                    Nulos <b className="num">{fmtInt(c.nulos)}</b>
                  </Text>
                  <Text size="sm">
                    Comparecimento <b className="num">{fmtInt(c.comparecimento)}</b>
                  </Text>
                </Group>
                <Table verticalSpacing={4} fz="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Nº</Table.Th>
                      <Table.Th>Candidato / legenda</Table.Th>
                      <Table.Th ta="right">Votos</Table.Th>
                      <Table.Th ta="right">%</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {votos.map((v, i) => {
                      const cor = corCand(v.sqcand, v.cor, v.numero ?? i);
                      return (
                        <Table.Tr key={`${v.tipo}-${v.numero}-${i}`}>
                          <Table.Td className="num" fw={700}>
                            {v.numero ?? "—"}
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text size="sm" fw={600}>
                                {v.nome_urna ?? (v.tipo === "legenda" ? `Legenda ${v.partido_sigla ?? ""}` : v.tipo)}
                                {v.partido_sigla && v.nome_urna ? (
                                  <Text span size="xs" c="dimmed">
                                    {" "}
                                    · {v.partido_sigla}
                                  </Text>
                                ) : null}
                              </Text>
                              <Box className="barra-trilho" style={{ height: 4 }}>
                                <Box className="barra-preenchida" style={{ width: `${(v.votos / max) * 100}%`, background: cor }} />
                              </Box>
                            </Stack>
                          </Table.Td>
                          <Table.Td ta="right" className="num">
                            {fmtInt(v.votos)}
                          </Table.Td>
                          <Table.Td ta="right" className="num">
                            {fmtPct(c.votos_validos ? (v.votos / c.votos_validos) * 100 : null, 1)}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            );
          })}
        </Tabs>
      )}
    </Stack>
  );
}
