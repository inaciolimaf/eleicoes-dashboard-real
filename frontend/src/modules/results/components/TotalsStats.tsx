import { Group, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import type { TotalsDto } from "../../../api/models";
import { Num } from "../../../components/Num";
import { fmtInt, fmtPct } from "../../../lib/formatting";

function Stat({
  label,
  value,
  pct,
  hint,
}: {
  label: string;
  value: number;
  pct?: number | null;
  hint?: string;
}) {
  return (
    <Tooltip label={hint} disabled={!hint}>
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
          {label}
        </Text>
        <Num value={value} style={{ fontSize: "1.05rem", fontWeight: 600 }} />
        {pct !== undefined && pct !== null && (
          <Text size="xs" c="dimmed">
            <Num value={pct} kind="pct" glow={false} />
          </Text>
        )}
      </Stack>
    </Tooltip>
  );
}

/** The six counters of the totals, in a grid of `cols` columns. */
export function TotalsStatGrid({ totals, cols }: { totals: TotalsDto; cols: number }) {
  const electoratePct = totals.electorate ? (totals.tallied_electorate / totals.electorate) * 100 : null;
  return (
    <SimpleGrid cols={cols} spacing="sm" verticalSpacing="xs">
      <Stat
        label="Brancos"
        value={totals.blank_votes}
        pct={totals.pct_blank}
        hint="% sobre o total de votos"
      />
      <Stat label="Nulos" value={totals.null_votes} pct={totals.pct_null} hint="% sobre o total de votos" />
      <Stat
        label="Abstenção"
        value={totals.abstention}
        pct={totals.pct_abstention}
        hint="% sobre o eleitorado apurado"
      />
      <Stat
        label="Comparecimento"
        value={totals.turnout}
        pct={totals.pct_turnout}
        hint="% sobre o eleitorado apurado"
      />
      <Stat label="Votos totais" value={totals.total_votes} />
      <Stat
        label="Eleitorado"
        value={totals.electorate}
        pct={electoratePct}
        hint={`Eleitorado apurado: ${fmtInt(totals.tallied_electorate)} (${fmtPct(electoratePct)})`}
      />
    </SimpleGrid>
  );
}

/** Single line with the three main percentages, for the compact layout. */
export function CompactTotals({ totals }: { totals: TotalsDto }) {
  return (
    <Group gap="md">
      <Text size="xs" c="dimmed">
        Brancos <b className="num">{fmtPct(totals.pct_blank)}</b>
      </Text>
      <Text size="xs" c="dimmed">
        Nulos <b className="num">{fmtPct(totals.pct_null)}</b>
      </Text>
      <Text size="xs" c="dimmed">
        Abstenção <b className="num">{fmtPct(totals.pct_abstention)}</b>
      </Text>
    </Group>
  );
}
