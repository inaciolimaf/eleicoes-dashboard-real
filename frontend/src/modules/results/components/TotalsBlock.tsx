import { Alert, Box, Group, Progress, Stack, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconInfoCircle } from "@tabler/icons-react";
import type { ResultsWithDataDto, TotalsDto } from "../../../api/models";
import { Num } from "../../../components/Num";
import { fmtInt } from "../../../lib/formatting";
import { DataSource } from "./DataSource";
import { CompactTotals, TotalsStatGrid } from "./TotalsStats";

/** Column count of the stats grid, from the width of the block. */
function columnsFor(width: number): number {
  if (width > 640) return 6;
  return width > 420 ? 3 : 2;
}

/** Share of the sections already tallied, as a bar. */
function TallyBar({ result }: { result: ResultsWithDataDto }) {
  const pct = result.totals.pct_sections;
  const inProgress = !result.final_tally && pct < 100;
  return (
    <Box>
      <Group justify="space-between" gap={4} mb={4} wrap="nowrap">
        <Text size="sm" fw={600}>
          <Num value={pct} kind="pct" />{" "}
          <Text span size="sm" c="dimmed" fw={400}>
            das seções totalizadas
          </Text>
        </Text>
        <Text size="xs" c="dimmed" className="num" visibleFrom="xs">
          {fmtInt(result.totals.sections_tallied)} de {fmtInt(result.totals.sections_total)}
        </Text>
      </Group>
      <Progress
        value={pct}
        size="md"
        radius="xl"
        color={pct >= 100 ? "green" : "election"}
        striped={inProgress}
        animated={inProgress}
        aria-label="Percentual de seções totalizadas"
      />
    </Box>
  );
}

/** Valid votes in highlight, with the turnout share and the final or decided flags. */
function ValidVotesSummary({ result, compact }: { result: ResultsWithDataDto; compact: boolean }) {
  const totals: TotalsDto = result.totals;
  return (
    <Group align="flex-end" justify="space-between" gap="xs">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.6 }}>
          Votos válidos
        </Text>
        <Num
          value={totals.valid_votes}
          style={{ fontSize: compact ? "1.6rem" : "2.3rem", fontWeight: 800, lineHeight: 1.1 }}
        />
        <Text size="sm" c="dimmed">
          <Num value={totals.pct_valid} kind="pct" glow={false} /> do comparecimento
        </Text>
      </Stack>
      {result.mathematically_decided && !result.final_tally && (
        <Text size="xs" c="teal.4" fw={600}>
          Matematicamente definido
        </Text>
      )}
      {result.final_tally && (
        <Text size="xs" c="green.5" fw={700}>
          Totalização final
        </Text>
      )}
    </Group>
  );
}

/** Notice of how many sections of this area came from the sum of the urn ballots. */
function CoverageNotice({ result }: { result: ResultsWithDataDto }) {
  const coverage = result.coverage;
  if (!coverage) return null;
  return (
    <Alert
      variant="light"
      color={coverage.collected_sections < coverage.total_sections ? "yellow" : "teal"}
      p="xs"
      icon={<IconInfoCircle size={16} />}
    >
      <Text size="sm">
        <b className="num">{fmtInt(coverage.collected_sections)}</b> de{" "}
        <b className="num">{fmtInt(coverage.total_sections)}</b> seções deste recorte coletadas (soma dos
        boletins de urna).
      </Text>
    </Alert>
  );
}

/** Totals block (RF-03): valid votes in highlight, with the counters of the area. */
export function TotalsBlock({ result, compact }: { result: ResultsWithDataDto; compact?: boolean }) {
  const { ref, width } = useElementSize();
  return (
    <Stack gap="sm" ref={ref}>
      <TallyBar result={result} />
      <ValidVotesSummary result={result} compact={!!compact} />
      {compact ? (
        <CompactTotals totals={result.totals} />
      ) : (
        <TotalsStatGrid totals={result.totals} cols={columnsFor(width)} />
      )}
      <CoverageNotice result={result} />
      <Group justify="flex-end">
        <DataSource result={result} />
      </Group>
    </Stack>
  );
}
