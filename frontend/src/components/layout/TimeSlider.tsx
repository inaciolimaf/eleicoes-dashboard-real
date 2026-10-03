import { ActionIcon, Badge, Box, Button, Group, SegmentedControl, Slider, Text, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconPlayerTrackNext, IconPlayerTrackPrev, IconBroadcast } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLinhaDoTempo } from "../../api/hooks";
import { useFiltro } from "../../store/filtro";
import { useTempo, VELOCIDADES, type Velocidade } from "../../store/tempo";
import { brt, fmtHora } from "../../lib/time";
import { COR_EVENTO, ROTULO_EVENTO } from "../../realtime/aplicar";

const COR_HEX: Record<string, string> = {
  orange: "#F97316", blue: "#3D7BFF", green: "#22C55E", yellow: "#EAB308", teal: "#14B8A6", grape: "#A855F7", cyan: "#06B6D4",
};
const PASSO_MS = 2000;

/** Slider global de tempo ("máquina do tempo") com replay e marcadores de eventos. */
export function TimeSlider() {
  const turno = useFiltro((s) => s.turno);
  const q = useLinhaDoTempo(turno);
  const { t, tocando, velocidade, novidades, setT, aoVivo, setTocando, setVelocidade } = useTempo();
  const qc = useQueryClient();
  const celular = useMediaQuery("(max-width: 48em)");
  const inicio = q.data?.inicio ? new Date(q.data.inicio).getTime() : null;
  const fim = q.data?.fim ? new Date(q.data.fim).getTime() : null;
  const valorAtual = t ? new Date(t).getTime() : fim ?? 0;
  const [arrastando, setArrastando] = useState<number | null>(null);

  // replay
  useEffect(() => {
    if (!tocando || !inicio || !fim) return;
    const id = setInterval(() => {
      const atual = useTempo.getState().t;
      const base = atual ? new Date(atual).getTime() : inicio;
      const prox = base + useTempo.getState().velocidade * PASSO_MS;
      if (prox >= fim) {
        voltarAoVivo();
        return;
      }
      useTempo.getState().setT(new Date(Math.floor(prox / 1000) * 1000).toISOString());
    }, PASSO_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando, inicio, fim]);

  const voltarAoVivo = () => {
    aoVivo();
    // recupera o estado ao vivo (diffs não foram aplicados enquanto T ≠ agora)
    qc.invalidateQueries({
      predicate: (qq) => {
        const k = qq.queryKey;
        return ["resultados", "filhos", "locais", "progresso"].includes(String(k[0])) && k[k.length - 1] === null;
      },
    });
  };

  const eventos = useMemo(() => {
    if (!q.data || !inicio || !fim || fim <= inicio) return [];
    return q.data.eventos
      .map((e) => ({ e, ms: new Date(e.ocorrido_em).getTime() }))
      .filter((x) => x.ms >= inicio && x.ms <= fim)
      .sort((a, b) => a.ms - b.ms);
  }, [q.data, inicio, fim]);

  const saltar = (dir: 1 | -1) => {
    const ref = valorAtual;
    const alvo = dir === 1 ? eventos.find((x) => x.ms > ref + 1000) : [...eventos].reverse().find((x) => x.ms < ref - 1000);
    if (alvo) setT(new Date(alvo.ms).toISOString());
  };

  if (!inicio || !fim || fim <= inicio) {
    return (
      <Group h="100%" px="md" gap="sm" justify="space-between">
        <Text size="sm" c="dimmed">
          {q.isLoading ? "Carregando linha do tempo…" : q.error ? "Linha do tempo indisponível" : "A linha do tempo aparece com os primeiros snapshots da apuração."}
        </Text>
        <Badge variant="light" color="red" leftSection={<span className="ao-vivo-dot" style={{ width: 6, height: 6 }} />}>
          Ao vivo
        </Badge>
      </Group>
    );
  }

  const exibido = arrastando ?? valorAtual;
  const aoVivoAgora = !t;

  return (
    <Group h="100%" px={{ base: "xs", sm: "md" }} gap="sm" wrap="nowrap">
      <Group gap={4} wrap="nowrap">
        <Tooltip label="Evento anterior">
          <ActionIcon variant="subtle" onClick={() => saltar(-1)} aria-label="Evento anterior" visibleFrom="sm">
            <IconPlayerTrackPrev size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={tocando ? "Pausar replay" : "Reproduzir a apuração (replay)"}>
          <ActionIcon variant="filled" radius="xl" size="lg" onClick={() => setTocando(!tocando)} aria-label={tocando ? "Pausar" : "Reproduzir"}>
            {tocando ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Próximo evento">
          <ActionIcon variant="subtle" onClick={() => saltar(1)} aria-label="Próximo evento" visibleFrom="sm">
            <IconPlayerTrackNext size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <SegmentedControl
        size="xs"
        value={String(velocidade)}
        onChange={(v) => setVelocidade(Number(v) as Velocidade)}
        data={VELOCIDADES.map((v) => ({ value: String(v), label: `${v}×` }))}
        visibleFrom="md"
        aria-label="Velocidade do replay"
      />
      <Box style={{ flex: 1, minWidth: 80 }} pt={14} pos="relative">
        <Box pos="absolute" top={0} left={8} right={8} h={12} style={{ pointerEvents: "none" }}>
          {eventos.map(({ e, ms }) => (
            <Tooltip key={e.id} label={`${fmtHora(e.ocorrido_em, false)} · ${ROTULO_EVENTO[e.tipo] ?? e.tipo}: ${e.titulo}`}>
              <Box
                className="marcador-evento"
                style={{ left: `${((ms - inicio) / (fim - inicio)) * 100}%`, background: COR_HEX[COR_EVENTO[e.tipo] ?? "blue"], pointerEvents: "auto" }}
                onClick={() => setT(new Date(ms).toISOString())}
              />
            </Tooltip>
          ))}
        </Box>
        <Slider
          min={inicio}
          max={fim}
          step={1000}
          value={Math.min(fim, Math.max(inicio, exibido))}
          onChange={setArrastando}
          onChangeEnd={(v) => {
            setArrastando(null);
            if (v >= fim - 30_000) voltarAoVivo();
            else setT(new Date(v).toISOString());
          }}
          label={(v) => brt(v).format("HH:mm:ss")}
          size="sm"
          color={aoVivoAgora ? "red" : "yellow"}
          aria-label="Linha do tempo"
        />
        <Group justify="space-between" mt={2} visibleFrom="sm">
          <Text fz={10} c="dimmed" className="num">
            {brt(inicio).format("DD/MM HH:mm")}
          </Text>
          <Text fz={10} c="dimmed" className="num">
            {brt(fim).format("DD/MM HH:mm")}
          </Text>
        </Group>
      </Box>
      <Text size="sm" fw={700} className="num" style={{ whiteSpace: "nowrap" }} c={aoVivoAgora ? undefined : "yellow.5"}>
        {brt(exibido).format(celular ? "HH:mm" : "HH:mm:ss")}
      </Text>
      {!aoVivoAgora && novidades > 0 && (
        <Badge color="red" variant="light" style={{ cursor: "pointer" }} onClick={voltarAoVivo} visibleFrom="sm">
          {novidades} novidade{novidades > 1 ? "s" : ""} — voltar ao vivo
        </Badge>
      )}
      <Button
        size="xs"
        color="red"
        variant={aoVivoAgora ? "filled" : "outline"}
        leftSection={aoVivoAgora ? <span className="ao-vivo-dot" style={{ background: "#fff", width: 7, height: 7 }} /> : <IconBroadcast size={14} />}
        onClick={voltarAoVivo}
        px={celular ? 8 : undefined}
      >
        {celular ? "VIVO" : "AO VIVO"}
      </Button>
    </Group>
  );
}
