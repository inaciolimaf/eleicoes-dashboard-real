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
import { useSection } from "../hooks";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { fmtDateTime, fmtTime } from "../../../lib/time";
import { fmtInt, fmtPct } from "../../../lib/formatting";
import { useCandidateColor } from "../../../lib/useColor";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { BadgeStatus } from "../../polling-places";
import type { SectionOfficeDto, PollingSectionDto, TallyStatus, SectionVoteDto } from "../../../api/models";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Box fz="sm">{children}</Box>
    </Stack>
  );
}

function SignatureBadge({ valid }: { valid: boolean | null | undefined }) {
  if (valid === true)
    return (
      <Badge color="teal" variant="light" leftSection={<IconShieldCheck size={12} />}>
        Assinatura válida
      </Badge>
    );
  if (valid === false)
    return (
      <Badge color="red" variant="light" leftSection={<IconShieldX size={12} />}>
        Assinatura inválida
      </Badge>
    );
  return (
    <Badge color="gray" variant="light" leftSection={<IconShieldQuestion size={12} />}>
      Não verificada
    </Badge>
  );
}

function SectionHeader({ section }: { section: PollingSectionDto }) {
  return (
    <Group justify="space-between" align="flex-start">
      <Stack gap={2}>
        <Text fw={800} size="lg">
          Seção <span className="num">{section.number}</span>
        </Text>
        <Text size="sm">
          <Anchor component={Link} to={`/locais/${section.polling_place.id}`}>
            {section.polling_place.name}
          </Anchor>{" "}
          ·{" "}
          <Anchor component={Link} to={`/explorar/zona/${section.zone.id}`}>
            Zona {section.zone.number}
          </Anchor>{" "}
          ·{" "}
          <Anchor component={Link} to={`/explorar/municipio/${section.municipality.id}`}>
            {section.municipality.name}/{section.state_code.toUpperCase()}
          </Anchor>
        </Text>
      </Stack>
      <Group gap={6}>
        <BadgeStatus status={section.status as TallyStatus} />
        <SignatureBadge valid={section.signature_valid} />
      </Group>
    </Group>
  );
}

function SectionFacts({ section, compact }: { section: PollingSectionDto; compact?: boolean }) {
  const turnoutPct =
    section.turnout != null && section.eligible_voters
      ? fmtPct((section.turnout / section.eligible_voters) * 100, 1)
      : "—";
  return (
    <SimpleGrid cols={{ base: 2, sm: compact ? 2 : 4 }} spacing="sm">
      <Info label="Eleitores aptos">
        <span className="num">{fmtInt(section.eligible_voters)}</span>
      </Info>
      <Info label="Comparecimento">
        <span className="num">{fmtInt(section.turnout)}</span>{" "}
        <Text span c="dimmed" size="xs">
          ({turnoutPct})
        </Text>
      </Info>
      <Info label="BU emitido (urna)">
        <span className="num">{fmtDateTime(section.issued_at)}</span>
      </Info>
      <Info label="Totalizado">
        <span className="num">{fmtTime(section.tallied_at)}</span>
      </Info>
    </SimpleGrid>
  );
}

/** Hash of the ballot box, copyable, and the link to the raw BU at the TSE. */
function HashRow({ section }: { section: PollingSectionDto }) {
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">
        Hash
      </Text>
      <Code style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {section.hash ?? "—"}
      </Code>
      {section.hash && (
        <CopyButton value={section.hash}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copiado" : "Copiar hash"}>
              <Button size="compact-xs" variant="subtle" onClick={copy}>
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </Button>
            </Tooltip>
          )}
        </CopyButton>
      )}
      {section.bu_url && (
        <Button
          size="compact-xs"
          variant="light"
          component="a"
          href={section.bu_url}
          target="_blank"
          rel="noopener"
          leftSection={<IconDownload size={12} />}
        >
          BU bruto (TSE)
        </Button>
      )}
    </Group>
  );
}

function VoteRow({
  vote,
  office,
  max,
  color,
}: {
  vote: SectionVoteDto;
  office: SectionOfficeDto;
  max: number;
  color: string;
}) {
  return (
    <Table.Tr>
      <Table.Td className="num" fw={700}>
        {vote.number ?? "—"}
      </Table.Td>
      <Table.Td>
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {vote.ballot_name ??
              (vote.kind === "legenda" ? `Legenda ${vote.party_abbreviation ?? ""}` : vote.kind)}
            {vote.party_abbreviation && vote.ballot_name ? (
              <Text span size="xs" c="dimmed">
                {" "}
                · {vote.party_abbreviation}
              </Text>
            ) : null}
          </Text>
          <Box className="barra-trilho" style={{ height: 4 }}>
            <Box
              className="barra-preenchida"
              style={{ width: `${(vote.votes / max) * 100}%`, background: color }}
            />
          </Box>
        </Stack>
      </Table.Td>
      <Table.Td ta="right" className="num">
        {fmtInt(vote.votes)}
      </Table.Td>
      <Table.Td ta="right" className="num">
        {fmtPct(office.valid_votes ? (vote.votes / office.valid_votes) * 100 : null, 1)}
      </Table.Td>
    </Table.Tr>
  );
}

function OfficePanel({ office }: { office: SectionOfficeDto }) {
  const candidateColor = useCandidateColor();
  const votes = [...office.votes].sort((a, b) => b.votes - a.votes);
  const max = votes[0]?.votes ?? 1;
  return (
    <Tabs.Panel value={String(office.office_code)} pt="xs">
      <Group gap="lg" mb="xs">
        <Text size="sm">
          Válidos <b className="num">{fmtInt(office.valid_votes)}</b>
        </Text>
        <Text size="sm">
          Brancos <b className="num">{fmtInt(office.blank_votes)}</b>
        </Text>
        <Text size="sm">
          Nulos <b className="num">{fmtInt(office.null_votes)}</b>
        </Text>
        <Text size="sm">
          Comparecimento <b className="num">{fmtInt(office.turnout)}</b>
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
          {votes.map((vote, i) => (
            <VoteRow
              key={`${vote.kind}-${vote.number}-${i}`}
              vote={vote}
              office={office}
              max={max}
              color={candidateColor(vote.tse_candidate_id, vote.color, vote.number ?? i)}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Tabs.Panel>
  );
}

function OfficeResults({
  section,
  initialOffice,
}: {
  section: PollingSectionDto;
  initialOffice: number | undefined;
}) {
  if (section.offices.length === 0) return <NoData title="Boletim de urna ainda não coletado" />;
  return (
    <Tabs defaultValue={String(initialOffice)} variant="outline">
      <ScrollArea type="never">
        <Tabs.List style={{ flexWrap: "nowrap" }}>
          {section.offices.map((c) => (
            <Tabs.Tab key={String(c.office_code)} value={String(c.office_code)}>
              {c.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </ScrollArea>
      {section.offices.map((office) => (
        <OfficePanel key={String(office.office_code)} office={office} />
      ))}
    </Tabs>
  );
}

/** Ballot box of a section: status, facts, the hash and the votes per office. */
export function SectionDetail({
  sectionId,
  compact,
}: {
  sectionId: string | null | undefined;
  compact?: boolean;
}) {
  const filter = useEffectiveFilter();
  const query = useSection(sectionId, filter.turno);
  if (!sectionId)
    return <NoData title="Escolha uma seção">Use a busca (Ctrl+K) ou configure o widget.</NoData>;
  if (query.isLoading) return <Loading rows={4} />;
  if (query.error) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  const section = query.data;
  if (!section) return <NoData />;
  const initialOffice =
    section.offices.find((c) => Number(c.office_code) === filter.cargo)?.office_code ??
    section.offices[0]?.office_code;
  return (
    <Stack gap="sm">
      <SectionHeader section={section} />
      <SectionFacts section={section} compact={compact} />
      {!compact && <HashRow section={section} />}
      <OfficeResults section={section} initialOffice={initialOffice} />
    </Stack>
  );
}
