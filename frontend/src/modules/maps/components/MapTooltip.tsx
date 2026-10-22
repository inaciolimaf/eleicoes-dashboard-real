import { Box, Group, Paper, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { ChildItemDto, MapPollingPlaceDto } from "../../../api/models";
import { fmtInt, fmtPP, fmtPct } from "../../../lib/formatting";
import { STATUS_COLORS, STATUS_LABELS } from "../../../lib/palettes";
import type { CandidateColorFn } from "../mapColors";
import { hasNoData } from "../mapColors";
import type { Hover } from "../useMapPicking";
import type { MapType } from "../types";

/** Width and height of the tooltip box, used to keep it inside the map. */
const TIP_WIDTH = 280;
const TIP_HEIGHT = 190;
const OFFSET = 14;

function HexTip({ pct, n }: { pct: number; n: number }) {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={700}>
        {fmtPct(pct, 1)} dos locais apurados
      </Text>
      <Text size="xs" c="dimmed">
        {fmtInt(n)} locais nesta área · clique para aproximar
      </Text>
    </Stack>
  );
}

function PlaceTip({
  place,
  candidateColor,
}: {
  place: MapPollingPlaceDto;
  candidateColor: CandidateColorFn;
}) {
  return (
    <Stack gap={3}>
      <Text size="sm" fw={700} lineClamp={2}>
        {place.name}
      </Text>
      {place.neighborhood && (
        <Text size="xs" c="dimmed">
          {place.neighborhood}
          {place.approximate ? " · posição aproximada" : ""}
        </Text>
      )}
      <Group gap={6}>
        <Box w={8} h={8} style={{ borderRadius: 9, background: STATUS_COLORS[place.status] }} />
        <Text size="xs">
          {STATUS_LABELS[place.status]} · {place.sections_tallied}/{place.sections_total} seções
        </Text>
      </Group>
      {place.leader && (
        <Group gap={6} wrap="nowrap">
          <Box
            w={10}
            h={10}
            style={{
              borderRadius: 3,
              background: candidateColor(place.leader.tse_candidate_id, place.leader.color),
            }}
          />
          <Text size="xs">
            <b>{place.leader.ballot_name}</b> {fmtPct(place.leader.pct)} · margem {fmtPP(place.margin_pp)}
          </Text>
        </Group>
      )}
      <Text size="xs" c="dimmed">
        Votos válidos: <span className="num">{fmtInt(place.valid_votes)}</span>
      </Text>
    </Stack>
  );
}

/** Values of the current map kind, shown below the leader in the region tooltip. */
function kindLines(item: ChildItemDto, type: MapType, candidateA: string | null, candidateB: string | null) {
  return (
    <>
      {type === "desempenho" && candidateA && item.values?.[candidateA] !== undefined && (
        <Text size="xs">
          Candidato: <b className="num">{fmtPct(item.values[candidateA])}</b>
        </Text>
      )}
      {type === "comparativo" && candidateA && candidateB && item.values && (
        <Text size="xs">
          A − B:{" "}
          <b className="num">{fmtPP((item.values[candidateA] ?? 0) - (item.values[candidateB] ?? 0))}</b>
        </Text>
      )}
      {type === "comparecimento" && item.electorate > 0 && (
        <Text size="xs">
          Comparecimento: <b className="num">{fmtPct((item.turnout / item.electorate) * 100)}</b>
        </Text>
      )}
      {type === "partido" && item.leader_party && (
        <Text size="xs">
          Partido mais votado: <b>{item.leader_party.abbreviation}</b>
        </Text>
      )}
    </>
  );
}

function RegionTip({
  name,
  item,
  type,
  candidateA,
  candidateB,
  candidateColor,
}: {
  name: string;
  item: ChildItemDto | null;
  type: MapType;
  candidateA: string | null;
  candidateB: string | null;
  candidateColor: CandidateColorFn;
}) {
  return (
    <Stack gap={3}>
      <Text size="sm" fw={700}>
        {name}
        {item?.state_code && item.level === "municipality" ? (
          <Text span c="dimmed" size="xs">
            {" "}
            · {item.state_code.toUpperCase()}
          </Text>
        ) : null}
      </Text>
      {!item || hasNoData(item) ? (
        <Text size="xs" c="dimmed">
          Sem dados ainda
        </Text>
      ) : (
        <>
          {item.leader && (
            <Group gap={6} wrap="nowrap">
              <Box
                w={10}
                h={10}
                style={{
                  borderRadius: 3,
                  background: candidateColor(item.leader.tse_candidate_id, item.leader.color),
                }}
              />
              <Text size="xs">
                Líder: <b>{item.leader.ballot_name}</b> {fmtPct(item.leader.pct)}
              </Text>
            </Group>
          )}
          {item.second && (
            <Group gap={6} wrap="nowrap">
              <Box
                w={10}
                h={10}
                style={{
                  borderRadius: 3,
                  background: candidateColor(item.second.tse_candidate_id, item.second.color),
                }}
              />
              <Text size="xs">
                2º: {item.second.ballot_name} {fmtPct(item.second.pct)}
              </Text>
            </Group>
          )}
          <Text size="xs">
            Margem: <b className="num">{fmtPP(item.margin_pp)}</b>
          </Text>
          {kindLines(item, type, candidateA, candidateB)}
          <Text size="xs" c="dimmed">
            Apurado: <span className="num">{fmtPct(item.pct_sections)}</span> · Válidos:{" "}
            <span className="num">{fmtInt(item.valid_votes)}</span>
          </Text>
        </>
      )}
    </Stack>
  );
}

function tipBody(hover: Hover, props: TipProps): ReactNode {
  if (hover.kind === "hex") return <HexTip pct={hover.pct} n={hover.n} />;
  if (hover.kind === "place") return <PlaceTip place={hover.place} candidateColor={props.candidateColor} />;
  return (
    <RegionTip
      name={hover.name}
      item={hover.item}
      type={props.type}
      candidateA={props.candidateA}
      candidateB={props.candidateB}
      candidateColor={props.candidateColor}
    />
  );
}

interface TipProps {
  type: MapType;
  candidateA: string | null;
  candidateB: string | null;
  candidateColor: CandidateColorFn;
}

/** Position of the tooltip next to the pointer, flipped to stay inside the map box. */
function tipPosition(hover: Hover, [width, height]: [number, number]) {
  return {
    left:
      width && hover.x + OFFSET + TIP_WIDTH > width
        ? Math.max(4, hover.x - OFFSET - TIP_WIDTH)
        : Math.max(4, hover.x + OFFSET),
    top:
      height && hover.y + OFFSET + TIP_HEIGHT > height
        ? Math.max(4, hover.y - OFFSET - TIP_HEIGHT)
        : Math.max(4, hover.y + OFFSET),
  };
}

/** Tooltip of the region or polling place under the pointer. */
export function MapTooltip({ hover, box, ...props }: TipProps & { hover: Hover; box: [number, number] }) {
  return (
    <Paper className="mapa-tooltip" withBorder shadow="lg" p="xs" radius="md" style={tipPosition(hover, box)}>
      {tipBody(hover, props)}
    </Paper>
  );
}
