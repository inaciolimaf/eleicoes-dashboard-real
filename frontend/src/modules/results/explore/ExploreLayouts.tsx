import { Card, Grid, Group, SegmentedControl, Stack } from "@mantine/core";
import type { Level } from "../../../api/models";
import { EventFeed } from "../../events";
import { Evolution } from "../../charts";
import { ProgressHeatmap } from "../../charts";
import { TotalsBlock } from "../components/TotalsBlock";
import { Scoreboard } from "../scoreboard/Scoreboard";
import { WithResults, StateChoice } from "../components/WithResults";
import { ExploreBlock } from "./ExploreBlock";
import { ExploreMap } from "./ExploreMap";
import { ExploreTable } from "./ExploreTable";
import type { ExploreState } from "./useExploreState";
import type { useEffectiveFilter } from "../../../lib/effective-filter";

type EffectiveFilter = ReturnType<typeof useEffectiveFilter>;

/** Evolution card with the two switches: the x axis (time or section percentage) and the metric. */
function EvolutionCard({ state, level, id }: { state: ExploreState; level: Level; id: string }) {
  return (
    <ExploreBlock
      title="Evolução da apuração"
      extra={
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value={state.axis}
            onChange={(value) => state.setAxis(value as typeof state.axis)}
            data={[
              { value: "t", label: "× horário" },
              { value: "pct_secoes", label: "× % seções" },
            ]}
          />
          <SegmentedControl
            size="xs"
            value={state.metric}
            onChange={(value) => state.setMetric(value as typeof state.metric)}
            data={[
              { value: "pct", label: "%" },
              { value: "votos", label: "Votos" },
              { value: "diferenca", label: "1º − 2º" },
            ]}
          />
        </Group>
      }
    >
      <Evolution level={level} id={id} xAxis={state.axis} metric={state.metric} height={300} />
    </ExploreBlock>
  );
}

/** Layout of an area where the office has no national result: the user picks the state first. */
export function StateChoiceLayout({
  state,
  level,
  id,
  filter,
}: {
  state: ExploreState;
  level: Level;
  id: string;
  filter: EffectiveFilter;
}) {
  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <ExploreMap state={state} level={level} id={id} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        <Stack gap="md">
          <Card p="md">
            <StateChoice
              office={filter.cargo}
              onSelectState={(uf, name) => state.openArea("state", uf, name)}
            />
          </Card>
          <ExploreBlock title="Progresso por UF">
            <ProgressHeatmap onSelectState={(uf, name) => state.openArea("state", uf, name)} />
          </ExploreBlock>
        </Stack>
      </Grid.Col>
      <Grid.Col span={12}>
        <ExploreTable state={state} level={level} id={id} />
      </Grid.Col>
    </Grid>
  );
}

/** Layout of an area with a result: totals and ranking, map, evolution, the areas table and the events. */
export function ResultLayout({
  state,
  level,
  id,
  filter,
}: {
  state: ExploreState;
  level: Level;
  id: string;
  filter: EffectiveFilter;
}) {
  const table = state.childLevel ? <ExploreTable state={state} level={level} id={id} /> : null;
  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, lg: 5 }}>
        <Stack gap="md">
          <Card p="md">
            <WithResults level={level} id={id}>
              {(result) => <TotalsBlock result={result} />}
            </WithResults>
          </Card>
          <Card p="md">
            <WithResults level={level} id={id} skeletonRows={6}>
              {(result) => <Scoreboard result={result} />}
            </WithResults>
          </Card>
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <Stack gap="md">
          {level !== "section" && <ExploreMap state={state} level={level} id={id} />}
          <EvolutionCard state={state} level={level} id={id} />
        </Stack>
      </Grid.Col>
      {table && <Grid.Col span={{ base: 12, lg: 8 }}>{table}</Grid.Col>}
      <Grid.Col span={{ base: 12, lg: table ? 4 : 12 }}>
        <ExploreBlock title="Eventos deste recorte">
          <EventFeed nivel={level} id={id} cargo={filter.cargo} limite={30} alturaMax={520} />
        </ExploreBlock>
      </Grid.Col>
    </Grid>
  );
}
