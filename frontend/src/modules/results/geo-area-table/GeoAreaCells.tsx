import { Badge, Box, Group, Progress, Stack, Text, Tooltip } from "@mantine/core";
import { memo } from "react";
import type { ChildItemDto } from "../../../api/models";
import { STATUS_COLORS, STATUS_LABELS } from "../../../lib/palettes";
import { fmtInt, fmtPct, fmtPP } from "../../../lib/formatting";
import type { CandidateColorOf } from "./geoAreaModel";
import type { ColumnId } from "./geoAreaModel";

const NO_VALUE = (
  <Text size="sm" c="dimmed">
    —
  </Text>
);

function NameCell({ item }: { item: ChildItemDto }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Tooltip label={STATUS_LABELS[item.status]}>
        <Box w={8} h={8} style={{ borderRadius: 8, background: STATUS_COLORS[item.status], flexShrink: 0 }} />
      </Tooltip>
      <Text size="sm" fw={600} lineClamp={1}>
        {item.name}
      </Text>
      {item.is_capital && (
        <Badge size="xs" variant="light" color="gray">
          capital
        </Badge>
      )}
    </Group>
  );
}

function ShareCell({ item }: { item: ChildItemDto }) {
  return (
    <Stack gap={2} miw={70}>
      <Text size="xs" className="num" ta="right">
        {fmtPct(item.pct_sections, 1)}
      </Text>
      <Progress value={item.pct_sections} size={4} color={item.pct_sections >= 100 ? "green" : "election"} />
    </Stack>
  );
}

/** The winner or the runner-up: name, share, and a bar in the candidate's color. */
function CandidateCell({
  candidate,
  bold,
  candidateColor,
}: {
  candidate: NonNullable<ChildItemDto["leader"]>;
  bold: boolean;
  candidateColor: CandidateColorOf;
}) {
  const color = candidateColor(candidate.tse_candidate_id, candidate.color);
  return (
    <Stack gap={2} miw={110}>
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Text size="sm" fw={bold ? 700 : 500} lineClamp={1}>
          {candidate.ballot_name}
        </Text>
        <Text size="xs" className="num">
          {fmtPct(candidate.pct, 1)}
        </Text>
      </Group>
      <Box className="barra-trilho" style={{ height: 4 }}>
        <Box
          className="barra-preenchida"
          style={{ width: `${Math.min(100, candidate.pct)}%`, background: color }}
        />
      </Box>
    </Stack>
  );
}

function PartyCell({ item }: { item: ChildItemDto }) {
  if (!item.leader_party) return NO_VALUE;
  return (
    <Group gap={6} wrap="nowrap">
      <Box w={10} h={10} style={{ borderRadius: 3, background: item.leader_party.color }} />
      <Text size="sm">{item.leader_party.abbreviation}</Text>
    </Group>
  );
}

function figure(text: string) {
  return (
    <Text size="sm" className="num" ta="right">
      {text}
    </Text>
  );
}

/** Value of one column for one row. */
function cellContent(item: ChildItemDto, column: ColumnId, candidateColor: CandidateColorOf) {
  switch (column) {
    case "nome":
      return <NameCell item={item} />;
    case "uf":
      return <Text size="sm">{(item.state_code ?? "").toUpperCase()}</Text>;
    case "regiao":
      return <Text size="sm">{item.region ?? "—"}</Text>;
    case "pct_secoes":
      return <ShareCell item={item} />;
    case "lider":
    case "segundo": {
      const candidate = column === "lider" ? item.leader : item.second;
      return candidate ? (
        <CandidateCell candidate={candidate} bold={column === "lider"} candidateColor={candidateColor} />
      ) : (
        NO_VALUE
      );
    }
    case "margem_pp":
      return figure(fmtPP(item.margin_pp));
    case "votos_validos":
      return figure(fmtInt(item.valid_votes));
    case "eleitorado":
      return figure(fmtInt(item.electorate));
    case "comparecimento":
      return figure(item.electorate ? fmtPct((item.turnout / item.electorate) * 100, 1) : "—");
    case "abstencao":
      return figure(fmtPct(item.pct_abstention, 1));
    case "capital":
      return <Text size="sm">{item.is_capital ? "Sim" : "Não"}</Text>;
    case "partido":
      return <PartyCell item={item} />;
  }
}

/** One cell of a row. Memoized: a row's cells only change with the row. */
export const GeoAreaCell = memo(function GeoAreaCell({
  item,
  column,
  candidateColor,
}: {
  item: ChildItemDto;
  column: ColumnId;
  candidateColor: CandidateColorOf;
}) {
  return cellContent(item, column, candidateColor);
});
