import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { useCandidate } from "../hooks";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { useCandidateColor } from "../../../lib/useColor";
import { STATE_BY_CODE } from "../../../lib/geo-areas";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { Num } from "../../../components/Num";
import { rgba } from "../../../lib/palettes";
import { ON_SOLID_TEXT } from "../../../lib/palettes/results";
import type { CandidateDetailDto, CandidateStatus, ViceDto } from "../../../api/models";
import { CandidateAvatar } from "./CandidateAvatar";
import { StatusBadge } from "./StatusBadge";

/** "Vice" for the vice-president; other kinds (substitutes) keep their capitalized name. */
function viceLabel(vice: ViceDto): string {
  if (vice.kind === "vice") return `Vice: ${vice.name}`;
  const kind = vice.kind ?? "";
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}: ${vice.name}`;
}

/** The ballot number and the name, as a link to the candidate's page when `link` is set. */
function NameLine({
  candidate,
  color,
  large,
  link,
}: {
  candidate: CandidateDetailDto;
  color: string;
  large: boolean;
  link: boolean;
}) {
  const size = large ? "xl" : "md";
  return (
    <Group gap={6} wrap="wrap">
      <Badge
        size={large ? "lg" : "md"}
        color={color}
        variant="filled"
        className="num"
        styles={{ root: { color: ON_SOLID_TEXT } }}
      >
        {candidate.ballot_number}
      </Badge>
      {link ? (
        <Text
          fw={800}
          size={size}
          lineClamp={1}
          component={Link}
          to={`/candidatos/${candidate.tse_candidate_id}`}
          c="inherit"
        >
          {candidate.ballot_name}
        </Text>
      ) : (
        <Text fw={800} size={size} lineClamp={1}>
          {candidate.ballot_name}
        </Text>
      )}
    </Group>
  );
}

/** Valid share, votes and position of the candidate in the area, and the situation badge. */
function ResultStats({ candidate, large }: { candidate: CandidateDetailDto; large: boolean }) {
  const result = candidate.result;
  if (!result) return null;
  const whereLabel = candidate.state_code ? `em ${candidate.state_code.toUpperCase()}` : "no Brasil";
  return (
    <Group gap="lg" mt={4} align="flex-end">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          % válidos
        </Text>
        <Num
value={result.valid_pct}
kind="pct"
          style={{ fontSize: large ? "2rem" : "1.4rem", fontWeight: 800 }}
        />
      </Stack>
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Votos
        </Text>
        <Num value={result.votes} style={{ fontSize: large ? "1.3rem" : "1rem", fontWeight: 600 }} />
      </Stack>
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Posição
        </Text>
        <Text fw={700} className="num">
          {result.position}º
        </Text>
      </Stack>
      <StatusBadge status={result.status as CandidateStatus} where={whereLabel} />
    </Group>
  );
}

/** Candidate card: photo, name, party, vice and the result in the filter's area. */
export function CandidateCard({
  tseCandidateId,
  large,
  link = true,
}: {
  tseCandidateId: string | null | undefined;
  large?: boolean;
  link?: boolean;
}) {
  const filter = useEffectiveFilter();
  const query = useCandidate(tseCandidateId, filter.turno, filter.t);
  const candidateColor = useCandidateColor();
  if (!tseCandidateId)
    return <NoData title="Escolha um candidato">Configure o widget para escolher o candidato.</NoData>;
  if (query.isLoading) return <Loading rows={2} />;
  if (query.error) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  const candidate = query.data;
  if (!candidate) return <NoData />;
  const color = candidateColor(candidate.tse_candidate_id, candidate.color, candidate.ballot_number);
  const isLarge = !!large;
  return (
    <Paper
      p={isLarge ? "lg" : "sm"}
      radius="lg"
      style={{
        background: `linear-gradient(135deg, ${rgba(color, 0.22)}, transparent 65%)`,
        border: `1px solid ${rgba(color, 0.35)}`,
      }}
    >
      <Group gap="md" wrap="nowrap" align="flex-start">
        <CandidateAvatar
          photoUrl={candidate.photo_url}
          name={candidate.ballot_name}
          color={color}
          size={isLarge ? 96 : 64}
        />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <NameLine candidate={candidate} color={color} large={isLarge} link={link} />
          <Text size="xs" c="dimmed" lineClamp={1}>
            {candidate.name}
          </Text>
          <Text size="sm">
            {[
              candidate.party_abbreviation,
              candidate.alliance && candidate.alliance !== candidate.party_abbreviation ? candidate.alliance : null,
              candidate.state_code
                ? (STATE_BY_CODE[candidate.state_code]?.name ?? candidate.state_code.toUpperCase())
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {candidate.vice_and_substitutes?.length > 0 && (
            <Text size="xs" c="dimmed">
              {candidate.vice_and_substitutes.map(viceLabel).join(" · ")}
            </Text>
          )}
          {candidate.result ? (
            <ResultStats candidate={candidate} large={isLarge} />
          ) : (
            <Text size="sm" c="dimmed">
              Sem votos apurados ainda.
            </Text>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}
