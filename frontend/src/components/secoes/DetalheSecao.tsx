import {
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconShieldCheck,
  IconShieldQuestion,
  IconShieldX,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useSecao } from "../../api/hooks";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { fmtDataHora, fmtHora } from "../../lib/time";
import { fmtInt, fmtPct } from "../../lib/format";
import { useCorCandidato } from "../../lib/useCor";
import { Carregando, ErroView, SemDados } from "../common/Estados";
import { BadgeStatus } from "../locais/DetalheLocal";
import type { TallyStatus } from "../../api/models";

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

export function DetalheSecao({
  secaoId,
  compacto,
}: {
  secaoId: string | null | undefined;
  compacto?: boolean;
}) {
  const f = useFiltroEfetivo();
  const q = useSecao(secaoId, f.turno);
  const corCand = useCorCandidato();
  if (!secaoId)
    return <SemDados titulo="Escolha uma seção">Use a busca (Ctrl+K) ou configure o widget.</SemDados>;
  if (q.isLoading) return <Carregando linhas={4} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  if (!s) return <SemDados />;
  const assinatura =
    s.signature_valid === true ? (
      <Badge color="teal" variant="light" leftSection={<IconShieldCheck size={12} />}>
        Assinatura válida
      </Badge>
    ) : s.signature_valid === false ? (
      <Badge color="red" variant="light" leftSection={<IconShieldX size={12} />}>
        Assinatura inválida
      </Badge>
    ) : (
      <Badge color="gray" variant="light" leftSection={<IconShieldQuestion size={12} />}>
        Não verificada
      </Badge>
    );
  const cargoInicial =
    s.offices.find((c) => Number(c.office_code) === f.cargo)?.office_code ?? s.offices[0]?.office_code;
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text fw={800} size="lg">
            Seção <span className="num">{s.number}</span>
          </Text>
          <Text size="sm">
            <Anchor component={Link} to={`/locais/${s.polling_place.id}`}>
              {s.polling_place.name}
            </Anchor>{" "}
            ·{" "}
            <Anchor component={Link} to={`/explorar/zona/${s.zone.id}`}>
              Zona {s.zone.number}
            </Anchor>{" "}
            ·{" "}
            <Anchor component={Link} to={`/explorar/municipio/${s.municipality.id}`}>
              {s.municipality.name}/{s.state_code.toUpperCase()}
            </Anchor>
          </Text>
        </Stack>
        <Group gap={6}>
          <BadgeStatus s={s.status as TallyStatus} />
          {assinatura}
        </Group>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: compacto ? 2 : 4 }} spacing="sm">
        <Info rotulo="Eleitores aptos">
          <span className="num">{fmtInt(s.eligible_voters)}</span>
        </Info>
        <Info rotulo="Comparecimento">
          <span className="num">{fmtInt(s.turnout)}</span>{" "}
          <Text span c="dimmed" size="xs">
            ({s.turnout != null && s.eligible_voters ? fmtPct((s.turnout / s.eligible_voters) * 100, 1) : "—"}
            )
          </Text>
        </Info>
        <Info rotulo="BU emitido (urna)">
          <span className="num">{fmtDataHora(s.issued_at)}</span>
        </Info>
        <Info rotulo="Totalizado">
          <span className="num">{fmtHora(s.tallied_at)}</span>
        </Info>
      </SimpleGrid>
      {!compacto && (
        <Group gap="xs" wrap="nowrap" align="center">
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">
            Hash
          </Text>
          <Code style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.hash ?? "—"}
          </Code>
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
          {s.bu_url && (
            <Button
              size="compact-xs"
              variant="light"
              component="a"
              href={s.bu_url}
              target="_blank"
              rel="noopener"
              leftSection={<IconDownload size={12} />}
            >
              BU bruto (TSE)
            </Button>
          )}
        </Group>
      )}
      {s.offices.length === 0 ? (
        <SemDados titulo="Boletim de urna ainda não coletado" />
      ) : (
        <Tabs defaultValue={String(cargoInicial)} variant="outline">
          <ScrollArea type="never">
            <Tabs.List style={{ flexWrap: "nowrap" }}>
              {s.offices.map((c) => (
                <Tabs.Tab key={String(c.office_code)} value={String(c.office_code)}>
                  {c.name}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </ScrollArea>
          {s.offices.map((c) => {
            const votos = [...c.votes].sort((a, b) => b.votes - a.votes);
            const max = votos[0]?.votes ?? 1;
            return (
              <Tabs.Panel key={String(c.office_code)} value={String(c.office_code)} pt="xs">
                <Group gap="lg" mb="xs">
                  <Text size="sm">
                    Válidos <b className="num">{fmtInt(c.valid_votes)}</b>
                  </Text>
                  <Text size="sm">
                    Brancos <b className="num">{fmtInt(c.blank_votes)}</b>
                  </Text>
                  <Text size="sm">
                    Nulos <b className="num">{fmtInt(c.null_votes)}</b>
                  </Text>
                  <Text size="sm">
                    Comparecimento <b className="num">{fmtInt(c.turnout)}</b>
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
                      const cor = corCand(v.tse_candidate_id, v.color, v.number ?? i);
                      return (
                        <Table.Tr key={`${v.kind}-${v.number}-${i}`}>
                          <Table.Td className="num" fw={700}>
                            {v.number ?? "—"}
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text size="sm" fw={600}>
                                {v.ballot_name ??
                                  (v.kind === "legenda" ? `Legenda ${v.party_abbreviation ?? ""}` : v.kind)}
                                {v.party_abbreviation && v.ballot_name ? (
                                  <Text span size="xs" c="dimmed">
                                    {" "}
                                    · {v.party_abbreviation}
                                  </Text>
                                ) : null}
                              </Text>
                              <Box className="barra-trilho" style={{ height: 4 }}>
                                <Box
                                  className="barra-preenchida"
                                  style={{ width: `${(v.votes / max) * 100}%`, background: cor }}
                                />
                              </Box>
                            </Stack>
                          </Table.Td>
                          <Table.Td ta="right" className="num">
                            {fmtInt(v.votes)}
                          </Table.Td>
                          <Table.Td ta="right" className="num">
                            {fmtPct(c.valid_votes ? (v.votes / c.valid_votes) * 100 : null, 1)}
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
