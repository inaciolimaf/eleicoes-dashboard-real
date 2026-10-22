import { Group, ScrollArea, Stack, Switch, Tabs, Text } from "@mantine/core";
import { IconChartDonut, IconUsers } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { ResultsWithDataDto } from "../../../api/models";
import { usePrefs } from "../../../lib/prefs-store";
import { Hemicycle } from "../../charts";
import { CandidateList } from "./CandidateList";
import { MarginSummary } from "./MarginSummary";
import { PartyTable } from "./PartyTable";
import { orderByVotes, summaryLine, visibleRows, type ScoreboardOptions } from "./scoreboardRows";

export type { ScoreboardOptions } from "./scoreboardRows";

/** Switch that keeps only the elected candidates, shared by the two layouts. */
function ElectedSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Switch
      size="xs"
      label="Só eleitos"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  );
}

/** Parties tab of a proportional office: the hemicycle over the party table, or a notice if not published. */
function PartiesPanel({ result }: { result: ResultsWithDataDto }) {
  if (result.alliances.length === 0)
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        Distribuição de vagas ainda não publicada.
      </Text>
    );
  return (
    <Stack gap="xs">
      <Hemicycle alliances={result.alliances} height={220} />
      <ScrollArea.Autosize mah={320} className="scroll-fino">
        <PartyTable result={result} />
      </ScrollArea.Autosize>
    </Stack>
  );
}

/** Ranking of the candidates of an office: majority offices show a flat list, proportional ones also parties. */
export function Scoreboard({
  result,
  options = {},
}: {
  result: ResultsWithDataDto;
  options?: ScoreboardOptions;
}) {
  const animate = usePrefs((s) => s.animacoes);
  const [onlyElected, setOnlyElected] = useState(!!options.onlyElected);
  const [tab, setTab] = useState<string | null>(options.tab ?? "candidates");
  const proportional = result.office.voting_system === "proporcional";
  const showPhotos = options.showPhotos ?? true;
  const link = options.linkCandidate ?? true;

  const ordered = useMemo(() => orderByVotes(result.candidates), [result.candidates]);
  const rows = useMemo(
    () => visibleRows(ordered, { onlyElected, topN: options.topN }),
    [ordered, onlyElected, options.topN],
  );
  const maxPct = ordered[0]?.valid_pct ?? 0;

  const list = (
    <CandidateList
      rows={rows}
      maxPct={maxPct}
      result={result}
      showPhotos={showPhotos}
      link={link}
      animate={animate}
      onlyElected={onlyElected}
    />
  );
  const electedSwitch = <ElectedSwitch checked={onlyElected} onChange={setOnlyElected} />;

  if (!proportional) {
    return (
      <Stack gap={4}>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {summaryLine(result)}
          </Text>
          {electedSwitch}
        </Group>
        {list}
        <MarginSummary result={result} ordered={ordered} />
      </Stack>
    );
  }

  return (
    <Tabs value={tab} onChange={setTab} variant="pills" radius="md">
      <Group justify="space-between" mb={6}>
        <Tabs.List>
          <Tabs.Tab value="candidates" leftSection={<IconUsers size={14} />}>
            Candidatos
          </Tabs.Tab>
          <Tabs.Tab value="parties" leftSection={<IconChartDonut size={14} />}>
            Partidos/Federações
          </Tabs.Tab>
        </Tabs.List>
        {tab === "candidates" && electedSwitch}
      </Group>
      <Tabs.Panel value="candidates">{list}</Tabs.Panel>
      <Tabs.Panel value="parties">
        <PartiesPanel result={result} />
      </Tabs.Panel>
    </Tabs>
  );
}
