import {
  ActionIcon,
  Box,
  Card,
  Grid,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCandidate } from "../hooks";
import type { Level } from "../../../api/models";
import { CandidateCard } from "../components/CandidateCard";
import { RegionPerformanceTable } from "./RegionPerformanceTable";
import { ElectoralMap } from "../../maps";
import { ErrorView } from "../../../components/States";
import { FilterProvider, useEffectiveFilter } from "../../../lib/effective-filter";
import { geoAreaLink } from "../../../lib/geo-areas";
import { useFavorites } from "../../accounts";
import { useFilter } from "../../../lib/filter-store";

type Scope = "uf" | "municipio";

/** Map of the candidate: by state, or by municipality when the candidate has no state (president). */
function CandidateMap({
  candidateId,
  level,
  id,
  allMunicipalities,
  office,
}: {
  candidateId: string;
  level: Level;
  id: string;
  allMunicipalities: boolean;
  office: number;
}) {
  const navigate = useNavigate();
  return (
    <Box h={{ base: 380, md: 520 }} style={{ borderRadius: 12, overflow: "hidden" }}>
      <ElectoralMap
        kind="desempenho"
        level={level}
        id={id}
        allMunicipalities={allMunicipalities}
        candidateA={candidateId}
        candidateSelector={false}
        cargo={office}
        onSelect={(selectedLevel, selectedId, name) => {
          useFilter.getState().setGeoArea(selectedLevel, selectedId, name);
          navigate(geoAreaLink(selectedLevel, selectedId));
        }}
      />
    </Box>
  );
}

/** The favorite toggle of the candidate, in the header. */
function FavoriteButton({ candidateId, name }: { candidateId: string; name: string }) {
  const { isFavorite, toggle } = useFavorites();
  const favorite = isFavorite("candidate", candidateId);
  return (
    <Tooltip label={favorite ? "Remover dos favoritos" : "Favoritar candidato"}>
      <ActionIcon
        variant="subtle"
        color="yellow"
        size="lg"
        onClick={() => toggle({ type: "candidate", ref: candidateId, label: name })}
        aria-label="Favoritar candidato"
      >
        {favorite ? <IconStarFilled size={20} /> : <IconStar size={20} />}
      </ActionIcon>
    </Tooltip>
  );
}

/** The map card and the ranking card, for a candidate with loaded data. */
function CandidateAreas({
  candidateId,
  office,
  state,
}: {
  candidateId: string;
  office: number;
  state: string | null;
}) {
  const [scope, setScope] = useState<Scope>("uf");
  const level: Level = state ? "state" : "country";
  const id = state ?? "br";
  const allMunicipalities = !state && scope === "municipio";
  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <Card p="md">
          <Group justify="space-between" mb="sm">
            <Text fw={700}>Desempenho por região</Text>
            {!state && (
              <SegmentedControl
                size="xs"
                value={scope}
                onChange={(value) => setScope(value as Scope)}
                data={[
                  { value: "uf", label: "Por UF" },
                  { value: "municipio", label: "Por município" },
                ]}
              />
            )}
          </Group>
          <CandidateMap
            candidateId={candidateId}
            level={level}
            id={id}
            allMunicipalities={allMunicipalities}
            office={office}
          />
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        <Card p="md">
          <Text fw={700} mb="sm">
            {allMunicipalities || state ? "Municípios" : "UFs"} — onde foi melhor
          </Text>
          <RegionPerformanceTable
            candidateId={candidateId}
            level={level}
            id={id}
            childLevel={allMunicipalities ? "municipality" : null}
          />
        </Card>
      </Grid.Col>
    </Grid>
  );
}

/** Screen of a candidate: the card, the favorite toggle, and the map and ranking of the places. */
export function CandidateScreen({ sq }: { sq: string }) {
  const filter = useEffectiveFilter();
  const query = useCandidate(sq, filter.turno, filter.t);
  const candidate = query.data;
  // the candidate's own office (the page can open with another office selected)
  const office = candidate ? candidate.office_code : filter.cargo;
  return (
    <FilterProvider value={{ cargo: office }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>{candidate?.ballot_name ?? "Candidato"}</Title>
          <FavoriteButton candidateId={sq} name={candidate?.ballot_name ?? sq} />
        </Group>
        <CandidateCard tseCandidateId={sq} large link={false} />
        {candidate && (
          <CandidateAreas candidateId={sq} office={office} state={candidate.state_code ?? null} />
        )}
        {query.error && <ErrorView error={query.error} onRetry={() => query.refetch()} />}
      </Stack>
    </FilterProvider>
  );
}
