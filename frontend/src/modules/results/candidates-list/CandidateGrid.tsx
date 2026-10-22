import { Badge, Card, Group, SimpleGrid, Stack, Text, UnstyledButton } from "@mantine/core";
import { Link } from "react-router-dom";
import type { CandidateDto } from "../../../api/models";
import { ON_SOLID_TEXT } from "../../../lib/palettes/results";
import { useCandidateColor } from "../../../lib/useColor";
import { CandidateAvatar } from "../components/CandidateAvatar";

/** One candidate of the list: a card linking to the candidate's page. */
function CandidateTile({ candidate, color }: { candidate: CandidateDto; color: string }) {
  return (
    <UnstyledButton component={Link} to={`/candidatos/${candidate.tse_candidate_id}`}>
      <Card p="sm" h="100%" className="clicavel">
        <Group wrap="nowrap" gap="sm">
          <CandidateAvatar
            photoUrl={candidate.photo_url}
            name={candidate.ballot_name}
            color={color}
            size={48}
          />
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Badge
                color={color}
                variant="filled"
                className="num"
                styles={{ root: { color: ON_SOLID_TEXT } }}
              >
                {candidate.ballot_number}
              </Badge>
              <Text fw={700} lineClamp={1}>
                {candidate.ballot_name}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {candidate.party_abbreviation}
              {candidate.alliance && candidate.alliance !== candidate.party_abbreviation
                ? ` · ${candidate.alliance}`
                : ""}
              {candidate.state_code ? ` · ${candidate.state_code.toUpperCase()}` : ""}
            </Text>
          </Stack>
        </Group>
      </Card>
    </UnstyledButton>
  );
}

/** Responsive grid of the candidate tiles. */
export function CandidateGrid({ candidates }: { candidates: CandidateDto[] }) {
  const candidateColor = useCandidateColor();
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 4 }} spacing="sm">
      {candidates.map((candidate) => (
        <CandidateTile
          key={candidate.tse_candidate_id}
          candidate={candidate}
          color={candidateColor(candidate.tse_candidate_id, candidate.color, candidate.ballot_number)}
        />
      ))}
    </SimpleGrid>
  );
}
