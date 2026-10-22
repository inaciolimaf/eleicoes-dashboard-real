import { Badge, Box, Group, Loader, Paper, Select, Text } from "@mantine/core";
import { useEffect } from "react";
import type { MapPollingPlacesDto } from "../../../api/models";
import { fmtInt } from "../../../lib/formatting";
import { ErrorView } from "../../../components/States";

/** Overlay position of the top-center badges. */
const TOP_CENTER: React.CSSProperties = {
  position: "absolute",
  top: 8,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 6,
};

/** Candidate selectors A and B (the comparison maps), at the top left. */
export function CandidateSelectors({
  comparison,
  options,
  candidateA,
  candidateB,
  onChangeA,
  onChangeB,
}: {
  comparison: boolean;
  options: { value: string; label: string }[];
  candidateA: string | null;
  candidateB: string | null;
  onChangeA: (value: string | null) => void;
  onChangeB: (value: string | null) => void;
}) {
  return (
    <Paper
      withBorder
      shadow="sm"
      p={6}
      radius="md"
      style={{ position: "absolute", top: 8, left: 8, zIndex: 6, maxWidth: "calc(100% - 70px)" }}
    >
      <Group gap={6} wrap="wrap">
        <Select
          size="xs"
          data={options}
          value={candidateA}
          onChange={onChangeA}
          searchable
          w={200}
          aria-label="Candidato A"
          comboboxProps={{ withinPortal: true }}
        />
        {comparison && (
          <>
            <Text size="xs" fw={700}>
              ×
            </Text>
            <Select
              size="xs"
              data={options}
              value={candidateB}
              onChange={onChangeB}
              searchable
              w={200}
              aria-label="Candidato B"
              comboboxProps={{ withinPortal: true }}
            />
          </>
        )}
      </Group>
    </Paper>
  );
}

/** Notes about the polling-places maps: how the colors read, and how many places are shown. */
export function PlacesNotes({
  pointsMode,
  showsValues,
  places,
}: {
  pointsMode: boolean;
  showsValues: boolean;
  places: MapPollingPlacesDto | undefined;
}) {
  return (
    <>
      {pointsMode && showsValues && (
        <Badge style={{ position: "absolute", top: 8, left: 8, zIndex: 6 }} variant="light" color="gray">
          Nos locais, a cor indica o vencedor de cada local
        </Badge>
      )}
      {places?.truncated && (
        <Badge style={TOP_CENTER} color="yellow" variant="light">
          Mostrando {fmtInt(places.items.length)} de {fmtInt(places.total)} locais
        </Badge>
      )}
    </>
  );
}

/** Loading indicator at the top right, next to the zoom control. */
export function LoadingBadge() {
  return (
    <Group gap={6} style={{ position: "absolute", top: 10, right: 50, zIndex: 6 }}>
      <Loader size="xs" />
      <Text size="xs" c="dimmed">
        Carregando…
      </Text>
    </Group>
  );
}

/** A compact error with its retry button, over the top of the map. */
export function MapError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Box style={{ position: "absolute", top: 8, left: 8, right: 50, zIndex: 7 }}>
      <Paper withBorder>
        <ErrorView erro={error} compacto onRetry={onRetry} />
      </Paper>
    </Box>
  );
}

/** Shown when a polling-places map has loaded and found nothing with coordinates. */
export function EmptyPlacesBadge() {
  return (
    <Badge style={TOP_CENTER} variant="light" color="gray">
      Sem locais de votação com coordenadas
    </Badge>
  );
}

/** Frames the map anyway if its `load` event is slow (a remote style): it is ready after 1.5 s. */
export function MapReadyFallback({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onReady, 1500);
    return () => clearTimeout(timer);
  }, [onReady]);
  return null;
}
