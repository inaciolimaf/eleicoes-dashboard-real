import { Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useEffect, useState } from "react";
import { useStatus } from "../../results";
import { useLive, topic } from "../../realtime";
import { useTime } from "../../../lib/time-store";
import { useUi } from "../../../lib/ui-store";
import { fmtShortDate, fmtTime, minutesSince } from "../../../lib/time";
import { fmtPct } from "../../../lib/formatting";
import type { StatusDto } from "../../../api/models";

/** Label of each TSE environment, as shown to the user. */
export const ENVIRONMENT: Record<string, string> = {
  fake: "Simulação local",
  simulado: "Simulado TSE",
  oficial: "Oficial",
  historico: "Histórico",
  replay: "Replay",
};

/** The status line of the indicator: its label, its color and the dot's class. */
interface IndicatorState {
  dotClass: string;
  label: string;
  color: string;
}

const STALE_AFTER_MINUTES = 5;
const REFRESH_MS = 30_000;

/** Works out what the indicator says from the current replay time, the status and the socket. */
function indicatorState(
  replayTime: string | null,
  status: StatusDto | undefined,
  hasError: boolean,
): IndicatorState {
  if (replayTime)
    return { dotClass: "ao-vivo-dot replay", label: `REPLAY ${fmtTime(replayTime, false)}`, color: "yellow" };
  if (!status)
    return hasError
      ? { dotClass: "ao-vivo-dot parado", label: "Sem conexão", color: "gray" }
      : { dotClass: "ao-vivo-dot parado", label: "Conectando…", color: "gray" };
  const lag = minutesSince(status.last_collection ?? status.last_tally, null);
  if (!status.live) {
    const upcoming = status.release_start && minutesSince(status.release_start, null)! < 0;
    return {
      dotClass: "ao-vivo-dot parado",
      label: upcoming ? `Divulgação às ${fmtTime(status.release_start, false)}` : "Fora do ar",
      color: "gray",
    };
  }
  if (lag !== null && lag > STALE_AFTER_MINUTES)
    return {
      dotClass: "ao-vivo-dot parado",
      label: `Desatualizado há ${Math.round(lag)} min`,
      color: "orange",
    };
  return { dotClass: "ao-vivo-dot", label: "AO VIVO", color: "red" };
}

const SOCKET_LABELS: Record<string, string> = {
  aberto: "conectado",
  reconectando: "reconectando…",
};

/** Tooltip with the details behind the indicator. */
function IndicatorDetails({
  status,
  replayTime,
  socketState,
}: {
  status: StatusDto | undefined;
  replayTime: string | null;
  socketState: string;
}) {
  return (
    <Stack gap={0}>
      {status && <span>Ambiente: {ENVIRONMENT[status.tse_environment] ?? status.tse_environment}</span>}
      {status && <span>Última totalização: {fmtShortDate(status.last_tally)}</span>}
      {status && <span>Última verificação: {fmtTime(status.last_collection)}</span>}
      {status?.pct_sections_br != null && <span>Seções apuradas (BR): {fmtPct(status.pct_sections_br)}</span>}
      {status?.collector.paused && <span>Coletor pausado</span>}
      <span>Tempo real: {SOCKET_LABELS[socketState] ?? "conectando…"}</span>
      {replayTime && <span>Clique para voltar ao vivo</span>}
    </Stack>
  );
}

/** Indicador AO VIVO (status + ws), com "Desatualizado há X min" e modo replay. */
export function LiveIndicator({ compacto }: { compacto?: boolean }) {
  const statusQuery = useStatus();
  useLive([topic.status()]);
  const replayTime = useTime((s) => s.t);
  const goLive = useTime((s) => s.aoVivo);
  const socketState = useUi((s) => s.wsEstado);
  const [, setTick] = useState(0);
  // re-renders every 30 seconds so "Desatualizado há X min" keeps up with the clock
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const status = statusQuery.data;
  const state = indicatorState(replayTime, status, !!statusQuery.error);

  return (
    <Tooltip
      label={<IndicatorDetails status={status} replayTime={replayTime} socketState={socketState} />}
      position="bottom"
    >
      <UnstyledButton onClick={() => replayTime && goLive()} aria-live="polite" aria-label={state.label}>
        <Group gap={8} wrap="nowrap">
          <span className={state.dotClass} />
          <Stack gap={0}>
            <Text
              size="xs"
              fw={800}
              c={state.color === "gray" ? "dimmed" : `${state.color}.5`}
              style={{ letterSpacing: 0.6, whiteSpace: "nowrap" }}
            >
              {state.label}
            </Text>
            {!replayTime && status?.last_tally && (
              <Text fz={10} c="dimmed" className="num" style={{ whiteSpace: "nowrap" }}>
                {fmtTime(status.last_tally, !compacto)} BRT
              </Text>
            )}
          </Stack>
        </Group>
      </UnstyledButton>
    </Tooltip>
  );
}
