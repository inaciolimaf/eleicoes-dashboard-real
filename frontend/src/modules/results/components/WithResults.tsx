import { Button, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconMap2 } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useElections, useResults } from "../hooks";
import type { Level, ResultsWithDataDto } from "../../../api/models";
import { defaultScope, officeInfo, OFFICE_NAME } from "../../../lib/offices";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { UFS } from "../../../lib/geo-areas";
import { topic, useLive } from "../../realtime";
import { Loading, ErrorView, NoData } from "../../../components/States";

/** The office is decided state by state and the view is the whole country: there is no single result. */
export function useOfficeWithoutBrResult(office: number, level: Level): boolean {
  const elections = useElections();
  const coverage = officeInfo(elections.data, office)?.coverage ?? defaultScope(office);
  return coverage === "uf" && level === "country";
}

/** Shown in place of the country result: the user picks a state (or the state map). */
export function StateChoice({
  office,
  onSelectState,
}: {
  office: number;
  onSelectState?: (uf: string, name: string) => void;
}) {
  return (
    <Stack align="center" gap="xs" py="md" px="sm">
      <ThemeIcon variant="light" size={40} radius="xl">
        <IconMap2 size={22} />
      </ThemeIcon>
      <Text fw={600} ta="center">
        {OFFICE_NAME[office] ?? "Este cargo"} é disputado por UF
      </Text>
      <Text size="sm" c="dimmed" ta="center" maw={420}>
        Não existe um resultado nacional único. Escolha uma UF (ou use o mapa de UFs).
      </Text>
      {onSelectState && (
        <Group gap={4} justify="center" maw={520}>
          {UFS.filter((u) => office !== 8 || u.uf === "df").map((u) => (
            <Button
              key={u.uf}
              size="compact-xs"
              variant="default"
              onClick={() => onSelectState(u.uf, u.nome)}
            >
              {u.uf.toUpperCase()}
            </Button>
          ))}
        </Group>
      )}
    </Stack>
  );
}

interface WithResultsProps {
  level?: Level;
  id?: string;
  children: (result: ResultsWithDataDto) => ReactNode;
  skeletonRows?: number;
  onSelectState?: (uf: string, name: string) => void;
}

/** Fetches the results of the effective filter (with live updates) and handles loading, no data and error. */
export function WithResults({ level, id, children, skeletonRows = 4, onSelectState }: WithResultsProps) {
  const filter = useEffectiveFilter();
  const resolvedLevel = level ?? filter.nivel;
  const resolvedId = id ?? filter.id;
  const withoutBrResult = useOfficeWithoutBrResult(filter.cargo, resolvedLevel);
  const query = useResults(
    { turno: filter.turno, cargo: filter.cargo, nivel: resolvedLevel, id: resolvedId, t: filter.t },
    !withoutBrResult,
  );
  useLive([!withoutBrResult && topic.results(filter.turno, filter.cargo, resolvedLevel, resolvedId)]);
  if (withoutBrResult) return <StateChoice office={filter.cargo} onSelectState={onSelectState} />;
  if (query.isLoading) return <Loading linhas={skeletonRows} />;
  if (query.error) return <ErrorView erro={query.error} onRetry={() => query.refetch()} />;
  if (!query.data || query.data.no_data) return <NoData />;
  return <>{children(query.data)}</>;
}
