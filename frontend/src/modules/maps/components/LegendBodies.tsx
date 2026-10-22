import { Box, Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import type { TallyStatus } from "../../../api/models";
import { fmtInt, fmtNum } from "../../../lib/formatting";
import {
  MARGIN_BANDS,
  STATUS_COLORS,
  STATUS_LABELS,
  cssGradient,
  divergingColor,
  sequentialColor,
} from "../../../lib/palettes";
import type { MapScale } from "../mapScale";
import type { LegendItem } from "../legendData";
import type { MapType } from "../types";

/** Color ramp with its two bounds, the unit included in the labels. */
function Gradient({
  fn,
  min,
  max,
  suffix,
  left,
  right,
}: {
  fn: (t: number) => [number, number, number];
  min: number;
  max: number;
  suffix: string;
  left?: string;
  right?: string;
}) {
  return (
    <Stack gap={2}>
      <Box h={10} style={{ borderRadius: 4, background: cssGradient(fn) }} />
      <Group justify="space-between">
        <Text size="xs" c="dimmed" className="num">
          {left ?? `${fmtNum(min, 1)}${suffix}`}
        </Text>
        <Text size="xs" c="dimmed" className="num">
          {right ?? `${fmtNum(max, 1)}${suffix}`}
        </Text>
      </Group>
    </Stack>
  );
}

/** The swatch that marks the regions without data. */
function NoDataSwatch() {
  return (
    <Group gap={6}>
      <Box
        w={16}
        h={10}
        className="hachurado"
        style={{ borderRadius: 3, border: "1px solid var(--mantine-color-default-border)" }}
      />
      <Text size="xs" c="dimmed">
        Sem dados
      </Text>
    </Group>
  );
}

/** Winners: one button per candidate (click to highlight it on the map) and the margin bands. */
export function WinnersBody({
  items,
  highlight,
  onHighlight,
  unit,
  municipalityWins,
}: {
  items: LegendItem[];
  highlight: string | null;
  onHighlight: (candidateId: string | null) => void;
  unit: string;
  municipalityWins: Map<string, number> | null;
}) {
  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed">
        Clique em um candidato para destacar onde venceu
      </Text>
      <Stack gap={2}>
        {items.slice(0, 12).map((c) => {
          const active = highlight === c.tseCandidateId;
          const municipalities = municipalityWins?.get(c.tseCandidateId);
          return (
            <UnstyledButton
              key={c.tseCandidateId}
              onClick={() => onHighlight(active ? null : c.tseCandidateId)}
              px={6}
              py={3}
              style={{
                borderRadius: 6,
                background: active ? "var(--mantine-color-default-hover)" : undefined,
                opacity: highlight && !active ? 0.55 : 1,
              }}
            >
              <Group gap={8} wrap="nowrap" justify="space-between">
                <Group gap={6} wrap="nowrap">
                  <Box w={12} h={12} style={{ borderRadius: 3, background: c.color, flexShrink: 0 }} />
                  <Text size="xs" fw={600} lineClamp={1}>
                    {c.label}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed" className="num" style={{ whiteSpace: "nowrap" }}>
                  {fmtInt(c.wins)}
                </Text>
              </Group>
              {active && (
                <Text size="xs" c="dimmed" mt={2}>
                  venceu em {fmtInt(c.wins)} {unit}
                  {municipalities !== undefined && unit === "UFs"
                    ? ` / ${fmtInt(municipalities)} municípios`
                    : ""}
                </Text>
              )}
            </UnstyledButton>
          );
        })}
      </Stack>
      <Tooltip
        label={`Opacidade proporcional à margem de vitória do líder: ${MARGIN_BANDS.map((f) => f.label).join(" · ")}`}
      >
        <Stack gap={2}>
          <Group gap={3} wrap="nowrap">
            {MARGIN_BANDS.map((f) => (
              <Box
                key={f.label}
                h={8}
                style={{ flex: 1, background: `rgba(140,150,175,${f.alpha})`, borderRadius: 2 }}
              />
            ))}
          </Group>
          <Group justify="space-between">
            <Text fz={10} c="dimmed">
              margem &lt; 2 p.p.
            </Text>
            <Text fz={10} c="dimmed">
              ≥ 20 p.p.
            </Text>
          </Group>
        </Stack>
      </Tooltip>
    </Stack>
  );
}

/** Sequential scales: performance of one candidate, progress, turnout. */
export function ScaleBody({
  type,
  scale,
  candidateLabel,
}: {
  type: MapType;
  scale: MapScale;
  candidateLabel?: string;
}) {
  return (
    <Stack gap={6}>
      {type === "desempenho" && candidateLabel && (
        <Text size="xs" fw={600}>
          {candidateLabel} · % dos válidos
        </Text>
      )}
      {type === "progresso" && (
        <Text size="xs" fw={600}>
          % das seções totalizadas
        </Text>
      )}
      {type === "comparecimento" && (
        <Text size="xs" fw={600}>
          % de comparecimento
        </Text>
      )}
      <Gradient fn={sequentialColor} min={scale.min} max={scale.max} suffix={scale.suffix} />
      <NoDataSwatch />
    </Stack>
  );
}

/** Diverging scale of the comparison: A on one side, B on the other. */
export function ComparativeBody({
  scale,
  labelA,
  labelB,
  colorA,
  colorB,
}: {
  scale: MapScale;
  labelA?: string;
  labelB?: string;
  colorA?: string;
  colorB?: string;
}) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600}>
        Diferença em p.p.
      </Text>
      <Gradient
        fn={(t) => divergingColor(1 - 2 * t, colorA, colorB)}
        min={scale.min}
        max={scale.max}
        suffix=""
        left={`${labelA ?? "A"} +${fmtNum(scale.max, 0)}`}
        right={`${labelB ?? "B"} +${fmtNum(scale.max, 0)}`}
      />
      <NoDataSwatch />
    </Stack>
  );
}

/** Polling places by tally status, with their counts. */
export function StatusBody({ statusCounts }: { statusCounts?: Partial<Record<TallyStatus, number>> }) {
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600}>
        Locais de votação
      </Text>
      {(["not_received", "partial", "tallied"] as TallyStatus[]).map((s) => (
        <Group key={s} gap={6} justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <Box w={10} h={10} style={{ borderRadius: 99, background: STATUS_COLORS[s] }} />
            <Text size="xs">{STATUS_LABELS[s]}</Text>
          </Group>
          {statusCounts && (
            <Text size="xs" c="dimmed" className="num">
              {fmtInt(statusCounts[s] ?? 0)}
            </Text>
          )}
        </Group>
      ))}
      <Text fz={10} c="dimmed">
        Em zoom baixo: hexágonos com a % de locais apurados
      </Text>
    </Stack>
  );
}

/** Parties leading at least one region, with the number of regions they lead. */
export function PartyBody({
  parties,
  unit,
}: {
  parties: { abbreviation: string; color: string; count: number }[];
  unit: string;
}) {
  return (
    <Stack gap={2}>
      <Text size="xs" fw={600}>
        Partido mais votado
      </Text>
      {parties.slice(0, 12).map((x) => (
        <Group key={x.abbreviation} gap={6} justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <Box w={12} h={12} style={{ borderRadius: 3, background: x.color }} />
            <Text size="xs" fw={600}>
              {x.abbreviation}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" className="num">
            {fmtInt(x.count)} {unit}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
