import { Badge, Box, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useChildren, WithResults, readGeoArea } from "../../results";
import { useLive, topic } from "../../realtime";
import { useChartColors, EChart } from "../../charts";
import { useEffectiveFilter, FilterProvider } from "../../../lib/effective-filter";
import { useCandidateColor } from "../../../lib/useColor";
import { fmtInt, fmtPct } from "../../../lib/formatting";
import { Num } from "../../../components/Num";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { ScrollBody } from "./scroll-body";
import { configArray, configString, type WidgetProps } from "./types";

// 7 ─ Side-by-side comparison
function ComparisonColumn({ level, id }: { level: string; id: string }) {
  const candidateColor = useCandidateColor();
  return (
    <FilterProvider value={{ nivel: level as never, id }}>
      <Stack
        gap={6}
        p="xs"
        style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 10, minWidth: 0 }}
      >
        <WithResults linhasSkeleton={3}>
          {(results) => (
            <Stack gap={6}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={700} size="sm" lineClamp={1}>
                  {results.geo_area.name}
                </Text>
                <Badge size="xs" variant="light">
                  {fmtPct(results.totals.pct_sections, 1)}
                </Badge>
              </Group>
              {[...results.candidates]
                .sort((a, b) => b.votes - a.votes)
                .slice(0, 4)
                .map((candidate) => {
                  const color = candidateColor(
                    candidate.tse_candidate_id,
                    candidate.color,
                    candidate.ballot_number,
                  );
                  return (
                    <Stack key={candidate.tse_candidate_id} gap={2}>
                      <Group justify="space-between" wrap="nowrap" gap={4}>
                        <Text size="xs" fw={600} lineClamp={1}>
                          {candidate.ballot_name}
                        </Text>
                        <Num
                          valor={candidate.valid_pct}
                          tipo="pct"
                          style={{ fontSize: 12, fontWeight: 700 }}
                        />
                      </Group>
                      <Box className="barra-trilho" style={{ height: 6 }}>
                        <Box
                          className="barra-preenchida"
                          style={{ width: `${candidate.valid_pct}%`, background: color }}
                        />
                      </Box>
                    </Stack>
                  );
                })}
              <Text size="xs" c="dimmed">
                Válidos: <span className="num">{fmtInt(results.totals.valid_votes)}</span>
              </Text>
            </Stack>
          )}
        </WithResults>
      </Stack>
    </FilterProvider>
  );
}

/** Bar chart of the candidates' share in the children of the filtered area. */
function CandidateComparison({ candidateIds, height }: { candidateIds: string[]; height: number }) {
  const filter = useEffectiveFilter();
  const base = useChildren({
    turno: filter.turno,
    cargo: filter.cargo,
    nivel: filter.nivel,
    id: filter.id,
    t: filter.t,
  });
  const selected = candidateIds.length
    ? candidateIds
    : (base.data?.candidates ?? []).slice(0, 2).map((c) => c.tse_candidate_id);
  const query = useChildren(
    {
      turno: filter.turno,
      cargo: filter.cargo,
      nivel: filter.nivel,
      id: filter.id,
      t: filter.t,
      candidatos: selected,
    },
    selected.length > 0,
  );
  useLive([topic.children(filter.turno, filter.cargo, filter.nivel, filter.id)]);
  const candidateColor = useCandidateColor();
  const chartColors = useChartColors();
  const data = query.data;
  const selectedKey = selected.join(",");
  const option = useMemo<EChartsOption | null>(() => {
    if (!data) return null;
    const items = [...data.items]
      .sort((a, b) => b.electorate - a.electorate)
      .slice(0, 14)
      .reverse();
    const candidates = selectedKey
      .split(",")
      .map((s) => data.candidates.find((x) => x.tse_candidate_id === s))
      .filter((x): x is NonNullable<typeof x> => !!x);
    return {
      grid: { left: 4, right: 18, top: 28, bottom: 4, containLabel: true },
      legend: { top: 0, textStyle: { color: chartColors.texto, fontSize: 11 } },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmtPct(Number(v)) },
      xAxis: {
        type: "value",
        axisLabel: { color: chartColors.textoFraco, formatter: "{value}%" },
        splitLine: { lineStyle: { color: chartColors.linha } },
      },
      yAxis: {
        type: "category",
        data: items.map((i) => i.name),
        axisLabel: { color: chartColors.texto, fontSize: 11, width: 110, overflow: "truncate" },
      },
      series: candidates.map((candidate) => ({
        type: "bar",
        name: candidate.ballot_name,
        itemStyle: {
          color: candidateColor(candidate.tse_candidate_id, candidate.color, candidate.ballot_number),
          borderRadius: [0, 4, 4, 0],
        },
        barMaxWidth: 12,
        data: items.map((i) => i.values?.[candidate.tse_candidate_id] ?? 0),
      })),
    } as EChartsOption;
  }, [data, selectedKey, candidateColor, chartColors]);
  if (query.isLoading || base.isLoading) return <Loading altura={height} />;
  if (query.error) return <ErrorView erro={query.error} onRetry={() => query.refetch()} />;
  if (!option) return <NoData />;
  return <EChart option={option} height={height} />;
}

export function ComparisonWidget({ config, height }: WidgetProps) {
  const mode = configString(config, "modo", "recortes");
  if (mode === "candidatos")
    return (
      <CandidateComparison candidateIds={configArray(config, "candidatos").slice(0, 4)} height={height} />
    );
  const areas = configArray(config, "recortes").map(readGeoArea).filter(Boolean).slice(0, 4) as {
    nivel: string;
    id: string;
  }[];
  const list = areas.length
    ? areas
    : [
        { nivel: "state", id: "sp" },
        { nivel: "state", id: "mg" },
        { nivel: "state", id: "rj" },
      ];
  return (
    <ScrollBody height={height}>
      <SimpleGrid cols={{ base: 1, xs: Math.min(2, list.length), md: list.length }} spacing="xs">
        {list.map((area) => (
          <ComparisonColumn key={`${area.nivel}:${area.id}`} level={area.nivel} id={area.id} />
        ))}
      </SimpleGrid>
    </ScrollBody>
  );
}
