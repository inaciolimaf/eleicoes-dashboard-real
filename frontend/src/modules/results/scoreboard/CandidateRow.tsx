import { Badge, Box, Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { Link } from "react-router-dom";
import type { CandidateResultDto, CandidateStatus, ResultsWithDataDto } from "../../../api/models";
import { useCandidateColor } from "../../../lib/useColor";
import { useFlash, Num } from "../../../components/Num";
import { ON_SOLID_TEXT } from "../../../lib/palettes/results";
import { CandidateAvatar } from "../components/CandidateAvatar";
import { StatusBadge } from "../components/StatusBadge";
import { showsMajorityLine, whereLabel } from "./scoreboardRows";

/** Name of the candidate, a link to the candidate's page when `link` is set. */
function RowName({ candidate, link }: { candidate: CandidateResultDto; link: boolean }) {
  const name = (
    <Text fw={700} size="sm" lineClamp={1} style={{ minWidth: 0 }}>
      {candidate.ballot_name}
    </Text>
  );
  if (!link) return name;
  return (
    <UnstyledButton component={Link} to={`/candidatos/${candidate.tse_candidate_id}`} style={{ minWidth: 0 }}>
      {name}
    </UnstyledButton>
  );
}

/** Ballot number, name and situation, with the candidate's valid share on the right. */
function RowTitle({
  candidate,
  result,
  link,
}: {
  candidate: CandidateResultDto;
  result: ResultsWithDataDto;
  link: boolean;
}) {
  const candidateColor = useCandidateColor();
  const color = candidateColor(candidate.tse_candidate_id, candidate.color, candidate.ballot_number);
  return (
    <Group gap={6} wrap="nowrap" justify="space-between" align="flex-start">
      <Group gap={6} wrap="wrap" style={{ minWidth: 0, flex: 1, rowGap: 2 }}>
        <Badge
          variant="filled"
          size="sm"
          radius="sm"
          color={color}
          className="num"
          styles={{ root: { flexShrink: 0, color: ON_SOLID_TEXT } }}
        >
          {candidate.ballot_number}
        </Badge>
        <RowName candidate={candidate} link={link} />
        <StatusBadge
          status={candidate.status as CandidateStatus}
          overallStatus={candidate.overall_status as CandidateStatus}
          where={whereLabel(result)}
          talliedAt={result.tallied_at}
          size="xs"
        />
      </Group>
      <Num
        valor={candidate.valid_pct}
        tipo="pct"
        style={{ fontWeight: 800, fontSize: "1.05rem" }}
        brilho={false}
      />
    </Group>
  );
}

/** Bar of the valid share relative to the leader, with the 50% line in majority offices. */
function VoteBar({
  candidate,
  result,
  maxPct,
}: {
  candidate: CandidateResultDto;
  result: ResultsWithDataDto;
  maxPct: number;
}) {
  const candidateColor = useCandidateColor();
  const color = candidateColor(candidate.tse_candidate_id, candidate.color, candidate.ballot_number);
  const width = maxPct > 0 ? Math.max(0.5, (candidate.valid_pct / Math.max(maxPct, 1)) * 100) : 0;
  const majority = result.office.voting_system === "majoritario";
  const showMajorityMark = majority && maxPct > 0 && maxPct <= 100 && showsMajorityLine(result);
  return (
    <Group gap={8} wrap="nowrap">
      <Box className="barra-trilho" style={{ flex: 1 }}>
        <Box className="barra-preenchida" style={{ width: `${width}%`, background: color }} />
        {showMajorityMark && (
          <Tooltip label="50% dos válidos">
            <Box
              className="barra-50"
              style={{
                left: `${(50 / Math.max(maxPct, 1)) * 100}%`,
                display: maxPct >= 50 ? "block" : "none",
              }}
            />
          </Tooltip>
        )}
      </Box>
      <Num
        valor={candidate.votes}
        style={{ fontSize: "0.8rem", minWidth: 90, textAlign: "right" }}
        brilho={false}
      />
    </Group>
  );
}

/** Party, alliance, vice and the vote destination, as one dimmed line. */
function RowSubline({ candidate }: { candidate: CandidateResultDto }) {
  const allianceText =
    candidate.alliance && candidate.alliance !== candidate.party_abbreviation
      ? ` · ${candidate.alliance}`
      : "";
  const viceText = candidate.vice_and_substitutes?.length
    ? ` · ${candidate.vice_and_substitutes.map((vice) => `${vice.kind === "vice" ? "Vice" : vice.kind}: ${vice.name}`).join(", ")}`
    : "";
  const destinationText =
    candidate.vote_destination && candidate.vote_destination !== "Válido"
      ? ` · ${candidate.vote_destination}`
      : "";
  return (
    <Text size="xs" c="dimmed" lineClamp={1}>
      {candidate.party_abbreviation}
      {allianceText}
      {viceText}
      {destinationText}
    </Text>
  );
}

/** One candidate of the scoreboard: name, situation, share, bar, votes and the party line. */
export function CandidateRow({
  candidate,
  maxPct,
  result,
  showPhoto,
  link,
}: {
  candidate: CandidateResultDto;
  maxPct: number;
  result: ResultsWithDataDto;
  showPhoto: boolean;
  link: boolean;
}) {
  const candidateColor = useCandidateColor();
  const color = candidateColor(candidate.tse_candidate_id, candidate.color, candidate.ballot_number);
  const flash = useFlash(candidate.votes);
  return (
    <Box py={6} px={4} className={flash ? "glow" : undefined}>
      <Group gap="sm" wrap="nowrap" align="center">
        {showPhoto && (
          <CandidateAvatar
            photoUrl={candidate.photo_url}
            name={candidate.ballot_name}
            color={color}
            size={40}
          />
        )}
        <Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
          <RowTitle candidate={candidate} result={result} link={link} />
          <VoteBar candidate={candidate} result={result} maxPct={maxPct} />
          <RowSubline candidate={candidate} />
        </Stack>
      </Group>
    </Box>
  );
}
