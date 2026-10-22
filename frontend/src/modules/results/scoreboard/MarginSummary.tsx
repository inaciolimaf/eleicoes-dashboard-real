import { Group, Stack, Text } from "@mantine/core";
import { IconArrowsDiff } from "@tabler/icons-react";
import type { CandidateResultDto, ResultsWithDataDto } from "../../../api/models";
import { fmtInt, fmtPP } from "../../../lib/formatting";
import { showsMajorityLine } from "./scoreboardRows";

/** Majority offices: the margin between the first two, the gap to the third and how far the leader is from 50%. */
export function MarginSummary({
  result,
  ordered,
}: {
  result: ResultsWithDataDto;
  ordered: CandidateResultDto[];
}) {
  if (result.office.voting_system !== "majoritario" || ordered.length < 2) return null;
  const [first, second] = ordered;
  const marginPp = result.leader?.margin_pp ?? first.valid_pct - second.valid_pct;
  const marginVotes = result.leader?.margin_votes ?? first.votes - second.votes;
  const seats = result.office.seats ?? 1;
  const third = seats >= 2 && ordered.length >= 3 ? ordered[2] : null;
  const missingForMajority = showsMajorityLine(result) && first.valid_pct < 50 ? 50 - first.valid_pct : null;
  return (
    <Stack gap={2} mt={4}>
      <Group gap={6}>
        <IconArrowsDiff size={14} color="var(--mantine-color-dimmed)" />
        <Text size="xs" c="dimmed">
          Diferença 1º × 2º: <b className="num">{fmtPP(marginPp)}</b> (
          <span className="num">{fmtInt(marginVotes)}</span> votos)
        </Text>
      </Group>
      {third && (
        <Text size="xs" c="dimmed" pl={20}>
          Diferença 2º × 3º (última vaga): <b className="num">{fmtPP(second.valid_pct - third.valid_pct)}</b>{" "}
          (<span className="num">{fmtInt(second.votes - third.votes)}</span> votos)
        </Text>
      )}
      {missingForMajority !== null && (
        <Text size="xs" c="dimmed" pl={20}>
          Líder precisa de mais <b className="num">{fmtPP(missingForMajority)}</b> para 50% + 1 dos válidos
        </Text>
      )}
    </Stack>
  );
}
