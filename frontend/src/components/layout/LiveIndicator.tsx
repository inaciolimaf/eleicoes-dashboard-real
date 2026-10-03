import { Group, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useEffect, useState } from "react";
import { useStatus } from "../../api/hooks";
import { useLive } from "../../realtime/useLive";
import { topico } from "../../realtime/topicos";
import { useTempo } from "../../store/tempo";
import { useUi } from "../../store/ui";
import { fmtDataCurta, fmtHora, minutosDesde } from "../../lib/time";
import { fmtPct } from "../../lib/format";

export const AMBIENTE: Record<string, string> = { fake: "Simulação local", simulado: "Simulado TSE", oficial: "Oficial", historico: "Histórico", replay: "Replay" };

/** Indicador AO VIVO (status + ws), com "Desatualizado há X min" e modo replay. */
export function LiveIndicator({ compacto }: { compacto?: boolean }) {
  const q = useStatus();
  useLive([topico.status()]);
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
    const atraso = minutosDesde(s.ultima_coleta ?? s.ultima_totalizacao, null);
    if (!s.ao_vivo) {
      rotulo = s.inicio_divulgacao && minutosDesde(s.inicio_divulgacao, null)! < 0 ? `Divulgação às ${fmtHora(s.inicio_divulgacao, false)}` : "Fora do ar";
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
      {s && <span>Ambiente: {AMBIENTE[s.ambiente] ?? s.ambiente}</span>}
      {s && <span>Última totalização: {fmtDataCurta(s.ultima_totalizacao)}</span>}
      {s && <span>Última verificação: {fmtHora(s.ultima_coleta)}</span>}
      {s?.pct_secoes_br != null && <span>Seções apuradas (BR): {fmtPct(s.pct_secoes_br)}</span>}
      {s?.coletor.pausado && <span>Coletor pausado</span>}
      <span>Tempo real: {ws === "aberto" ? "conectado" : ws === "reconectando" ? "reconectando…" : "conectando…"}</span>
      {t && <span>Clique para voltar ao vivo</span>}
    </Stack>
  );

  return (
    <Tooltip label={dica} position="bottom">
      <UnstyledButton onClick={() => t && aoVivo()} aria-live="polite" aria-label={rotulo}>
        <Group gap={8} wrap="nowrap">
          <span className={cls} />
          <Stack gap={0}>
            <Text size="xs" fw={800} c={cor === "gray" ? "dimmed" : `${cor}.5`} style={{ letterSpacing: 0.6, whiteSpace: "nowrap" }}>
              {rotulo}
            </Text>
            {!t && s?.ultima_totalizacao && (
              <Text fz={10} c="dimmed" className="num" style={{ whiteSpace: "nowrap" }}>
                {fmtHora(s.ultima_totalizacao, !compacto)} BRT
              </Text>
            )}
          </Stack>
        </Group>
      </UnstyledButton>
    </Tooltip>
  );
}
