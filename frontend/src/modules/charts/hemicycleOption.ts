import type { EChartsOption } from "echarts";
import type { AllianceDto } from "../../api/models";
import { fmtInt } from "../../lib/formatting";
import { SEAT_CAPTION_COLOR } from "../../lib/palettes/charts";

export interface SeatPosition {
  x: number;
  y: number;
}

/** Smallest number of concentric rows whose seats fit `total` (capped at 30 rows). */
function rowsFor(total: number): number {
  let rows = 1;
  for (;;) {
    let capacity = 0;
    for (let i = 0; i < rows; i++) capacity += Math.floor((Math.PI * (rows + i)) / 1.0);
    if (capacity >= total || rows > 30) return rows;
    rows++;
  }
}

/** Distributes `total` seats in concentric rows of a semicircle, ordered from left to right. */
export function seatPositions(total: number): SeatPosition[] {
  if (total <= 0) return [];
  const rows = rowsFor(total);
  const radii = Array.from({ length: rows }, (_, i) => rows + i);
  const radiiSum = radii.reduce((a, b) => a + b, 0);
  const points: (SeatPosition & { angle: number })[] = [];
  let remaining = total;
  radii.forEach((radius, index) => {
    const seats = index === radii.length - 1 ? remaining : Math.round((total * radius) / radiiSum);
    remaining -= seats;
    for (let k = 0; k < seats; k++) {
      const angle = seats === 1 ? Math.PI / 2 : Math.PI - (Math.PI * k) / (seats - 1);
      points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle), angle });
    }
  });
  // sorted by angle so that each party paints a contiguous block
  return points.sort((a, b) => b.angle - a.angle).map(({ x, y }) => ({ x, y }));
}

/** Option of the hemicycle: one scatter series per alliance, with the seats total in the center. */
export function buildHemicycleOption(alliances: AllianceDto[]): EChartsOption {
  const withSeats = alliances
    .filter((alliance) => (alliance.seats ?? 0) > 0)
    .sort((a, b) => (b.seats ?? 0) - (a.seats ?? 0));
  const total = withSeats.reduce((sum, alliance) => sum + (alliance.seats ?? 0), 0);
  const points = seatPositions(total);
  const symbolSize = Math.max(5, Math.min(18, 260 / Math.sqrt(Math.max(total, 1) * 3)));
  let offset = 0;
  const series = withSeats.map((alliance) => {
    const seats = alliance.seats ?? 0;
    const data = points.slice(offset, offset + seats).map((p) => [p.x, p.y]);
    offset += seats;
    return {
      type: "scatter" as const,
      name: alliance.name,
      data,
      symbolSize,
      itemStyle: { color: alliance.color },
      emphasis: { scale: 1.4 },
      tooltip: {
        formatter: () =>
          `<b>${alliance.name}</b><br/>${alliance.parties.join(" · ")}<br/>${alliance.seats} vaga(s) · ${fmtInt(alliance.votes)} votos`,
      },
    };
  });
  const radius = points.reduce((max, p) => Math.max(max, Math.abs(p.x), p.y), 1);
  return {
    tooltip: { trigger: "item" },
    grid: { left: 4, right: 4, top: 4, bottom: 28 },
    xAxis: { show: false, min: -radius - 1, max: radius + 1 },
    yAxis: { show: false, min: -0.5, max: radius + 1 },
    graphic: [
      {
        type: "text",
        left: "center",
        bottom: 4,
        style: { text: `${total} vagas`, fontSize: 14, fontWeight: 700, fill: SEAT_CAPTION_COLOR },
      },
    ],
    series,
  } as EChartsOption;
}
