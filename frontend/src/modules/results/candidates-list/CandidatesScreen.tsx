import { Group, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useCandidates, useElections } from "../hooks";
import type { CandidateDto } from "../../../api/models";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { defaultScope, officeInfo, OFFICE_NAME } from "../../../lib/offices";
import { UFS, stateOfId } from "../../../lib/geo-areas";
import { useFilter } from "../../../lib/filter-store";
import { CandidateGrid } from "./CandidateGrid";
import { filterCandidates, MAX_SHOWN_CANDIDATES, partyOptions } from "./candidatesList";

/** Office code of the district deputy: the only office of the Federal District, so it starts on DF. */
const DISTRICT_OFFICE = 8;

interface CandidatesToolbarProps {
  officeName: string;
  round: number;
  byState: boolean;
  state: string | null;
  onStateChange: (state: string | null) => void;
  parties: string[];
  party: string | null;
  onPartyChange: (party: string | null) => void;
  search: string;
  onSearchChange: (search: string) => void;
}

/** Title of the screen, and the filters: UF (for state offices), party and a name or number search. */
function CandidatesToolbar(props: CandidatesToolbarProps) {
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          Candidatos · {props.round}º turno
        </Text>
        <Title order={2}>{props.officeName}</Title>
      </Stack>
      <Group gap="xs">
        {props.byState && (
          <Select
            w={190}
            data={UFS.map((u) => ({ value: u.uf, label: `${u.uf.toUpperCase()} · ${u.name}` }))}
            value={props.state}
            onChange={props.onStateChange}
            searchable
            aria-label="UF"
          />
        )}
        <Select
          w={130}
          data={props.parties}
          value={props.party}
          onChange={props.onPartyChange}
          placeholder="Partido"
          clearable
          searchable
        />
        <TextInput
          w={220}
          placeholder="Nome ou número…"
          leftSection={<IconSearch size={14} />}
          value={props.search}
          onChange={(event) => props.onSearchChange(event.currentTarget.value)}
        />
      </Group>
    </Group>
  );
}

/** Body of the list: loading, error, nothing found, or the grid. */
function CandidatesBody({
  query,
  candidates,
}: {
  query: UseQueryResult<CandidateDto[], Error>;
  candidates: CandidateDto[];
}) {
  if (query.isLoading) return <Loading rows={6} />;
  if (query.error) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  if (!candidates.length) return <NoData title="Nenhum candidato encontrado" />;
  return <CandidateGrid candidates={candidates.slice(0, MAX_SHOWN_CANDIDATES)} />;
}

/** Candidates of the filter's round and office, with UF, party and search filters. */
export function CandidatesScreen() {
  const filter = useFilter();
  const elections = useElections();
  const coverage = officeInfo(elections.data, filter.cargo)?.coverage ?? defaultScope(filter.cargo);
  const byState = coverage === "uf";
  const [state, setState] = useState<string | null>(
    stateOfId(filter.nivel, filter.id) ?? (filter.cargo === DISTRICT_OFFICE ? "df" : "sp"),
  );
  const [search, setSearch] = useState("");
  const [party, setParty] = useState<string | null>(null);
  const query = useCandidates(filter.turno, filter.cargo, byState ? state : null, !byState || !!state);
  const candidates = useMemo(() => query.data ?? [], [query.data]);
  const parties = useMemo(() => partyOptions(candidates), [candidates]);
  const shown = useMemo(() => filterCandidates(candidates, { search, party }), [candidates, search, party]);
  const officeName = candidates[0]?.office_name ?? OFFICE_NAME[filter.cargo] ?? "Candidatos";
  return (
    <Stack gap="md">
      <CandidatesToolbar
        officeName={officeName}
        round={filter.turno}
        byState={byState}
        state={state}
        onStateChange={setState}
        parties={parties}
        party={party}
        onPartyChange={setParty}
        search={search}
        onSearchChange={setSearch}
      />
      <CandidatesBody query={query} candidates={shown} />
      {shown.length > MAX_SHOWN_CANDIDATES && (
        <Text size="sm" c="dimmed" ta="center">
          Mostrando {MAX_SHOWN_CANDIDATES} de {shown.length}. Refine a busca.
        </Text>
      )}
    </Stack>
  );
}
