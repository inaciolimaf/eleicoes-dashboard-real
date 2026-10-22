import { ActionIcon, Collapse, Group, Paper, ScrollArea, Text } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import type { TallyStatus } from "../../../api/models";
import type { LegendItem } from "../legendData";
import type { MapScale } from "../mapScale";
import type { MapType } from "../types";
import { ComparativeBody, PartyBody, ScaleBody, StatusBody, WinnersBody } from "./LegendBodies";

export interface LegendProps {
  type: MapType;
  candidates: LegendItem[];
  highlight: string | null;
  onHighlight: (candidateId: string | null) => void;
  /** unit of the regions: "UFs" | "municípios" | "locais" */
  unit: string;
  scale?: MapScale;
  labelA?: string;
  labelB?: string;
  colorA?: string;
  colorB?: string;
  statusCounts?: Partial<Record<TallyStatus, number>>;
  municipalityWins?: Map<string, number> | null;
  parties?: { abbreviation: string; color: string; count: number }[];
}

const DEFAULT_SCALE: MapScale = { min: 0, max: 100, suffix: "%" };
const DEFAULT_COMPARATIVE_SCALE: MapScale = { min: -20, max: 20, suffix: " p.p." };
/** Kinds that have a legend: the others draw without one. */
const LEGEND_TYPES: MapType[] = [
  "vencedores",
  "desempenho",
  "progresso",
  "comparecimento",
  "comparativo",
  "locais",
  "partido",
];

/** The legend body of the current map kind; null when the kind has no legend. */
function LegendBody(p: LegendProps) {
  switch (p.type) {
    case "vencedores":
      return (
        <WinnersBody
          items={p.candidates}
          highlight={p.highlight}
          onHighlight={p.onHighlight}
          unit={p.unit}
          municipalityWins={p.municipalityWins ?? null}
        />
      );
    case "desempenho":
    case "progresso":
    case "comparecimento":
      return <ScaleBody type={p.type} scale={p.scale ?? DEFAULT_SCALE} candidateLabel={p.labelA} />;
    case "comparativo":
      return (
        <ComparativeBody
          scale={p.scale ?? DEFAULT_COMPARATIVE_SCALE}
          labelA={p.labelA}
          labelB={p.labelB}
          colorA={p.colorA}
          colorB={p.colorB}
        />
      );
    case "locais":
      return <StatusBody statusCounts={p.statusCounts} />;
    case "partido":
      return <PartyBody parties={p.parties ?? []} unit={p.unit} />;
  }
  return null;
}

/** Floating legend of the map (bottom left), collapsible; collapsed by default on phones. */
export function Legend(p: LegendProps) {
  const phone = useMediaQuery("(max-width: 48em)");
  const [open, { toggle }] = useDisclosure(!phone);
  if (!LEGEND_TYPES.includes(p.type)) return null;
  return (
    <Paper
      withBorder
      shadow="md"
      p="xs"
      radius="md"
      style={{
        position: "absolute",
        left: 8,
        bottom: 8,
        zIndex: 5,
        width: "calc(240px * var(--mantine-scale))",
        maxWidth: "calc(100% - 16px)",
        backdropFilter: "blur(6px)",
      }}
    >
      <Group justify="space-between" gap={4} mb={open ? 4 : 0}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Legenda
        </Text>
        <ActionIcon
          size="xs"
          variant="subtle"
          onClick={toggle}
          aria-label={open ? "Recolher legenda" : "Expandir legenda"}
        >
          {open ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
        </ActionIcon>
      </Group>
      <Collapse in={open}>
        <ScrollArea.Autosize mah={260} className="scroll-fino" offsetScrollbars>
          <LegendBody {...p} />
        </ScrollArea.Autosize>
      </Collapse>
    </Paper>
  );
}
