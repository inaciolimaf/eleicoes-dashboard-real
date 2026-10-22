import { Box, Group, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { useProgress } from "../hooks";
import type { ProgressCountryDto, ProgressItemDto } from "../../../api/models";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { sequentialColor, cssGradient } from "../../../lib/palettes";
import { fmtInt, fmtPct } from "../../../lib/formatting";
import { useLive, topic } from "../../realtime";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { ProgressTile, type ProgressMetric } from "./ProgressTile";

export type ProgressMode = "grid" | "list";

/** The state that tallies no votes (the abroad pseudo-state) only shows in the list. */
const ABROAD_STATE_CODE = "zz";

function LegendRow({ metric }: { metric: ProgressMetric }) {
  return (
    <Group gap={4}>
      <Text size="xs" c="dimmed">
        {metric === "pct_secoes" ? "0%" : "60%"}
      </Text>
      <Box w={70} h={8} style={{ borderRadius: 4, background: cssGradient(sequentialColor) }} />
      <Text size="xs" c="dimmed">
        {metric === "pct_secoes" ? "100%" : "95%"}
      </Text>
    </Group>
  );
}

function CountryLine({ country }: { country: ProgressCountryDto }) {
  return (
    <Text size="sm">
      Brasil: <b className="num">{fmtPct(country.pct_sections)}</b>{" "}
      <Text span c="dimmed" size="xs">
        ({fmtInt(country.sections_tallied)} de {fmtInt(country.sections_total)} seções)
      </Text>
    </Text>
  );
}

function StateList({
  items,
  onSelectState,
}: {
  items: ProgressItemDto[];
  onSelectState?: (uf: string, name: string) => void;
}) {
  return (
    <SimpleGrid cols={{ base: 3, sm: 5, md: 7 }} spacing={4}>
      {[...items]
        .sort((a, b) => b.pct_sections - a.pct_sections)
        .map((item) => (
          <Paper
            key={item.state_code}
            p={4}
            withBorder
            onClick={() => onSelectState?.(item.state_code, item.name)}
            className="clicavel"
          >
            <Text size="xs" fw={700}>
              {item.state_code.toUpperCase()} <span className="num">{fmtPct(item.pct_sections, 1)}</span>
            </Text>
          </Paper>
        ))}
    </SimpleGrid>
  );
}

function StateGrid({
  items,
  metric,
  onSelectState,
}: {
  items: ProgressItemDto[];
  metric: ProgressMetric;
  onSelectState?: (uf: string, name: string) => void;
}) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 4,
        maxWidth: 520,
        width: "100%",
        margin: "0 auto",
      }}
    >
      {items.map((item) => (
        <ProgressTile
          key={item.state_code}
          item={item}
          metric={metric}
          onClick={() => onSelectState?.(item.state_code, item.name)}
        />
      ))}
    </Box>
  );
}

interface ProgressHeatmapProps {
  metric?: ProgressMetric;
  onSelectState?: (uf: string, name: string) => void;
  mode?: ProgressMode;
}

/** Progress of the tally by state: a cartogram of tiles, or a list sorted by progress. */
export function ProgressHeatmap({
  metric = "pct_secoes",
  onSelectState,
  mode = "grid",
}: ProgressHeatmapProps) {
  const filter = useEffectiveFilter();
  const query = useProgress(filter.turno, filter.t);
  useLive([topic.progress(filter.turno)]);
  if (query.isLoading) return <Loading height={240} />;
  if (query.error) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data || !query.data.items.length) return <NoData />;
  const items = query.data.items.filter((item) => item.state_code !== ABROAD_STATE_CODE || mode === "list");
  return (
    <Stack gap="xs" h="100%">
      <Group justify="space-between">
        <CountryLine country={query.data.country} />
        <LegendRow metric={metric} />
      </Group>
      {mode === "grid" ? (
        <StateGrid items={items} metric={metric} onSelectState={onSelectState} />
      ) : (
        <StateList items={items} onSelectState={onSelectState} />
      )}
    </Stack>
  );
}
