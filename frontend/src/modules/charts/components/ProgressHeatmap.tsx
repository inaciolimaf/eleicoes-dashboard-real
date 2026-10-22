import { Box, Group, Paper, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useProgress } from "../hooks";
import type { ProgressItemDto } from "../../../api/models";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { sequentialColor, cssGradient } from "../../../lib/palettes";
import { fmtInt, fmtPct } from "../../../lib/formatting";
import { fmtTime } from "../../../lib/time";
import { useLive } from "../../realtime";
import { topic } from "../../realtime";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { useFlash } from "../../../components/Num";

/** Cartograma em grade das UFs (col, linha) */
const GRADE: Record<string, [number, number]> = {
  rr: [2, 0],
  ap: [4, 0],
  am: [1, 1],
  pa: [3, 1],
  ma: [4, 1],
  ce: [5, 1],
  rn: [6, 1],
  ac: [0, 2],
  ro: [1, 2],
  mt: [2, 2],
  to: [3, 2],
  pi: [4, 2],
  pe: [5, 2],
  pb: [6, 2],
  ms: [2, 3],
  go: [3, 3],
  df: [4, 3],
  ba: [5, 3],
  al: [6, 3],
  sp: [3, 4],
  mg: [4, 4],
  es: [5, 4],
  se: [6, 4],
  pr: [3, 5],
  rj: [4, 5],
  sc: [3, 6],
  rs: [3, 7],
};

function Tile({
  it,
  metrica,
  onClick,
}: {
  it: ProgressItemDto;
  metrica: "pct_secoes" | "pct_comparecimento";
  onClick?: () => void;
}) {
  const v = metrica === "pct_secoes" ? it.pct_sections : it.pct_turnout;
  const t = metrica === "pct_secoes" ? v / 100 : (v - 60) / 35;
  const [r, g, b] = sequentialColor(t);
  const claro = r * 0.299 + g * 0.587 + b * 0.114 > 150;
  const flash = useFlash(it.pct_sections);
  return (
    <Tooltip
      label={
        <Stack gap={0}>
          <b>{it.name}</b>
          <span>
            {fmtPct(it.pct_sections)} das seções ({fmtInt(it.sections_tallied)} de {fmtInt(it.sections_total)}
            )
          </span>
          <span>
            Municípios: {it.municipalities_completed} finalizados · {it.municipalities_partial} parciais ·{" "}
            {it.municipalities_not_received} sem dados
          </span>
          <span>Comparecimento: {fmtPct(it.pct_turnout)}</span>
          <span>Atualizado às {fmtTime(it.tallied_at)}</span>
        </Stack>
      }
    >
      <UnstyledButton
        onClick={onClick}
        className={flash ? "glow" : undefined}
        style={{
          gridColumn: (GRADE[it.state_code]?.[0] ?? 0) + 1,
          gridRow: (GRADE[it.state_code]?.[1] ?? 0) + 1,
          background: `rgb(${r},${g},${b})`,
          color: claro ? "#0B1220" : "#fff",
          borderRadius: 8,
          aspectRatio: "1 / 1",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
          transition: "background 500ms ease",
        }}
        aria-label={`${it.name}: ${fmtPct(v)}`}
      >
        <Text fw={800} fz="clamp(9px, 1.2vw, 14px)" lh={1}>
          {it.state_code.toUpperCase()}
        </Text>
        <Text fz="clamp(8px, 0.9vw, 11px)" className="num" lh={1.2}>
          {fmtPct(v, 1).replace("%", "")}
        </Text>
      </UnstyledButton>
    </Tooltip>
  );
}

export function ProgressHeatmap({
  metrica = "pct_secoes",
  onSelecionarUf,
  modo = "grade",
}: {
  metrica?: "pct_secoes" | "pct_comparecimento";
  onSelecionarUf?: (uf: string, nome: string) => void;
  modo?: "grade" | "lista";
}) {
  const f = useEffectiveFilter();
  const q = useProgress(f.turno, f.t);
  useLive([topic.progress(f.turno)]);
  if (q.isLoading) return <Loading altura={240} />;
  if (q.error) return <ErrorView erro={q.error} onRetry={() => q.refetch()} />;
  if (!q.data || !q.data.items.length) return <NoData />;
  const itens = q.data.items.filter((i) => i.state_code !== "zz" || modo === "lista");
  return (
    <Stack gap="xs" h="100%">
      <Group justify="space-between">
        <Text size="sm">
          Brasil: <b className="num">{fmtPct(q.data.country.pct_sections)}</b>{" "}
          <Text span c="dimmed" size="xs">
            ({fmtInt(q.data.country.sections_tallied)} de {fmtInt(q.data.country.sections_total)} seções)
          </Text>
        </Text>
        <Group gap={4}>
          <Text size="xs" c="dimmed">
            {metrica === "pct_secoes" ? "0%" : "60%"}
          </Text>
          <Box w={70} h={8} style={{ borderRadius: 4, background: cssGradient(sequentialColor) }} />
          <Text size="xs" c="dimmed">
            {metrica === "pct_secoes" ? "100%" : "95%"}
          </Text>
        </Group>
      </Group>
      {modo === "grade" ? (
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
          {itens.map((it) => (
            <Tile
              key={it.state_code}
              it={it}
              metrica={metrica}
              onClick={() => onSelecionarUf?.(it.state_code, it.name)}
            />
          ))}
        </Box>
      ) : (
        <SimpleGrid cols={{ base: 3, sm: 5, md: 7 }} spacing={4}>
          {[...itens]
            .sort((a, b) => b.pct_sections - a.pct_sections)
            .map((it) => (
              <Paper
                key={it.state_code}
                p={4}
                withBorder
                onClick={() => onSelecionarUf?.(it.state_code, it.name)}
                className="clicavel"
              >
                <Text size="xs" fw={700}>
                  {it.state_code.toUpperCase()} <span className="num">{fmtPct(it.pct_sections, 1)}</span>
                </Text>
              </Paper>
            ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
