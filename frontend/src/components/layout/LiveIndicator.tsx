import { Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useEffect, useState } from "react";
import { useStatus } from "../../api/hooks";
import { useLive } from "../../realtime/useLive";
import { topic } from "../../realtime/topics";
import { useTempo } from "../../store/tempo";
import { useUi } from "../../store/ui";
import { fmtDataCurta, fmtHora, minutosDesde } from "../../lib/time";
import { fmtPct } from "../../lib/format";

export const AMBIENTE: Record<string, string> = {
  fake: "Simulação local",
  simulado: "Simulado TSE",
  oficial: "Oficial",
  historico: "Histórico",
  replay: "Replay",
};

/** Indicador AO VIVO (status + ws), com "Desatualizado há X min" e modo replay. */
export function LiveIndicator({ compacto }: { compacto?: boolean }) {
  const q = useStatus();
  useLive([topic.status()]);
  const t = useTempo((s) => s.t);
  const aoVivo = useTempo((s) => s.aoVivo);
  const ws = useUi((s) => s.wsEstado);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const s = q.data;

  let cls = "ao-vivo-dot parado";
  let rotulo = "Conectando…";
  let cor = "gray";
  if (t) {
    cls = "ao-vivo-dot replay";
    rotulo = `REPLAY ${fmtHora(t, false)}`;
    cor = "yellow";
  } else if (s) {
    const atraso = minutosDesde(s.last_collection ?? s.last_tally, null);
    if (!s.live) {
      rotulo =
        s.release_start && minutosDesde(s.release_start, null)! < 0
          ? `Divulgação às ${fmtHora(s.release_start, false)}`
          : "Fora do ar";
    } else if (atraso !== null && atraso > 5) {
      rotulo = `Desatualizado há ${Math.round(atraso)} min`;
      cor = "orange";
    } else {
      cls = "ao-vivo-dot";
      rotulo = "AO VIVO";
      cor = "red";
    }
  } else if (q.error) {
    rotulo = "Sem conexão";
  }

  const dica = (
    <Stack gap={0}>
      {s && <span>Ambiente: {AMBIENTE[s.tse_environment] ?? s.tse_environment}</span>}
      {s && <span>Última totalização: {fmtDataCurta(s.last_tally)}</span>}
      {s && <span>Última verificação: {fmtHora(s.last_collection)}</span>}
      {s?.pct_sections_br != null && <span>Seções apuradas (BR): {fmtPct(s.pct_sections_br)}</span>}
      {s?.collector.paused && <span>Coletor pausado</span>}
      <span>
        Tempo real: {ws === "aberto" ? "conectado" : ws === "reconectando" ? "reconectando…" : "conectando…"}
      </span>
      {t && <span>Clique para voltar ao vivo</span>}
    </Stack>
  );

  return (
    <Tooltip label={dica} position="bottom">
      <UnstyledButton onClick={() => t && aoVivo()} aria-live="polite" aria-label={rotulo}>
        <Group gap={8} wrap="nowrap">
          <span className={cls} />
          <Stack gap={0}>
            <Text
              size="xs"
              fw={800}
              c={cor === "gray" ? "dimmed" : `${cor}.5`}
              style={{ letterSpacing: 0.6, whiteSpace: "nowrap" }}
            >
              {rotulo}
            </Text>
            {!t && s?.last_tally && (
              <Text fz={10} c="dimmed" className="num" style={{ whiteSpace: "nowrap" }}>
                {fmtHora(s.last_tally, !compacto)} BRT
              </Text>
            )}
          </Stack>
        </Group>
      </UnstyledButton>
    </Tooltip>
  );
}
