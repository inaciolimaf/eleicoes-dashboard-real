import { Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import type { ProgressItemDto } from "../../../api/models";
import { sequentialColor } from "../../../lib/palettes";
import { ON_LIGHT_TILE_TEXT, ON_SOLID_TEXT } from "../../../lib/palettes/results";
import { fmtInt, fmtPct } from "../../../lib/formatting";
import { fmtTime } from "../../../lib/time";
import { useFlash } from "../../../components/Num";
import { STATE_GRID } from "../stateGrid";

export type ProgressMetric = "pct_secoes" | "pct_comparecimento";

/** Brightness of a tile's text: light tiles get dark text. */
function isLightColor([r, g, b]: [number, number, number]): boolean {
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

function TileTooltip({ item }: { item: ProgressItemDto }) {
  return (
    <Stack gap={0}>
      <b>{item.name}</b>
      <span>
        {fmtPct(item.pct_sections)} das seções ({fmtInt(item.sections_tallied)} de{" "}
        {fmtInt(item.sections_total)})
      </span>
      <span>
        Municípios: {item.municipalities_completed} finalizados · {item.municipalities_partial} parciais ·{" "}
        {item.municipalities_not_received} sem dados
      </span>
      <span>Comparecimento: {fmtPct(item.pct_turnout)}</span>
      <span>Atualizado às {fmtTime(item.tallied_at)}</span>
    </Stack>
  );
}

/** One state of the heatmap, colored by its progress. */
export function ProgressTile({
  item,
  metric,
  onClick,
}: {
  item: ProgressItemDto;
  metric: ProgressMetric;
  onClick?: () => void;
}) {
  const value = metric === "pct_secoes" ? item.pct_sections : item.pct_turnout;
  const scale = metric === "pct_secoes" ? value / 100 : (value - 60) / 35;
  const rgb = sequentialColor(scale);
  const flash = useFlash(item.pct_sections);
  const [column, row] = STATE_GRID[item.state_code] ?? [0, 0];
  const [r, g, b] = rgb;
  return (
    <Tooltip label={<TileTooltip item={item} />}>
      <UnstyledButton
        onClick={onClick}
        className={flash ? "glow" : undefined}
        style={{
          gridColumn: column + 1,
          gridRow: row + 1,
          background: `rgb(${r},${g},${b})`,
          color: isLightColor(rgb) ? ON_LIGHT_TILE_TEXT : ON_SOLID_TEXT,
          borderRadius: 8,
          aspectRatio: "1 / 1",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
          transition: "background 500ms ease",
        }}
        aria-label={`${item.name}: ${fmtPct(value)}`}
      >
        <Text fw={800} fz="clamp(9px, 1.2vw, 14px)" lh={1}>
          {item.state_code.toUpperCase()}
        </Text>
        <Text fz="clamp(8px, 0.9vw, 11px)" className="num" lh={1.2}>
          {fmtPct(value, 1).replace("%", "")}
        </Text>
      </UnstyledButton>
    </Tooltip>
  );
}
