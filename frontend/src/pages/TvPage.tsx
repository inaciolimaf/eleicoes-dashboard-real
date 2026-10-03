import { ActionIcon, Box, Group, Paper, SegmentedControl, Text, Title, Tooltip } from "@mantine/core";
import { useFullscreen, useIdle } from "@mantine/hooks";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Carregando } from "../components/common/Estados";
import { LiveIndicator } from "../components/layout/LiveIndicator";
import { brt } from "../lib/time";
import { Grade } from "../paineis/Grade";
import { aplicarFiltroDoPainel } from "../paineis/PainelView";
import { usePaineis } from "../paineis/repo";
import { templatePadrao } from "../paineis/templates";
import { useLive } from "../realtime/useLive";
import { topico } from "../realtime/topicos";
import { useFiltro } from "../store/filtro";
import { useUi } from "../store/ui";

/** Modo TV: tela cheia, rotação automática entre painéis e fonte grande. */
export default function TvPage() {
  const repo = usePaineis();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { toggle, fullscreen } = useFullscreen();
  const idle = useIdle(3500);
  const setModoTv = useUi((s) => s.setModoTv);
  const turno = useFiltro((s) => s.turno);
  useLive([topico.eventos(turno), topico.status()]);
  const lista = useMemo(
    () => (repo.paineis.length ? repo.paineis : [{ id: "template", nome: "Noite da eleição", config: templatePadrao() }]),
    [repo.paineis],
  );
  const inicio = Math.max(0, lista.findIndex((p) => p.id === sp.get("inicio")));
  const [idx, setIdx] = useState(inicio);
  const [rodando, setRodando] = useState(true);
  const [segundos, setSegundos] = useState(30);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    setModoTv(true);
    return () => setModoTv(false);
  }, [setModoTv]);
  useEffect(() => setIdx(inicio), [inicio]);
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!rodando || lista.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % lista.length), segundos * 1000);
    return () => clearInterval(id);
  }, [rodando, segundos, lista.length]);

  const atual = lista[idx % lista.length];
  useEffect(() => {
    if (atual) aplicarFiltroDoPainel(atual.config);
  }, [atual]);

  if (repo.carregando) return <Carregando linhas={8} />;
  return (
    <Box p="md" mih="100vh" style={{ cursor: idle ? "none" : undefined }}>
      <Group justify="space-between" mb="md" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <Title order={1} style={{ letterSpacing: -0.6 }} lineClamp={1}>
            {atual?.nome}
          </Title>
          {lista.length > 1 && (
            <Text c="dimmed" className="num">
              {(idx % lista.length) + 1}/{lista.length}
            </Text>
          )}
        </Group>
        <Group gap="lg" wrap="nowrap">
          <LiveIndicator />
          <Text fw={800} className="num" fz={28}>
            {brt(agora).format("HH:mm:ss")}
          </Text>
        </Group>
      </Group>
      {atual && <Grade key={atual.id} config={atual.config} editando={false} somenteLeitura modoTv />}
      <Paper
        withBorder
        shadow="xl"
        p={6}
        radius="xl"
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 400,
          opacity: idle ? 0 : 1,
          transition: "opacity 300ms ease",
        }}
      >
        <Group gap={6} wrap="nowrap">
          <ActionIcon variant="subtle" onClick={() => setIdx((i) => (i - 1 + lista.length) % lista.length)} aria-label="Painel anterior">
            <IconChevronLeft size={18} />
          </ActionIcon>
          <ActionIcon variant="filled" radius="xl" onClick={() => setRodando(!rodando)} aria-label={rodando ? "Pausar rotação" : "Retomar rotação"}>
            {rodando ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
          </ActionIcon>
          <ActionIcon variant="subtle" onClick={() => setIdx((i) => (i + 1) % lista.length)} aria-label="Próximo painel">
            <IconChevronRight size={18} />
          </ActionIcon>
          <SegmentedControl
            size="xs"
            value={String(segundos)}
            onChange={(v) => setSegundos(Number(v))}
            data={["15", "30", "60", "120"].map((v) => ({ value: v, label: `${v}s` }))}
          />
          <Tooltip label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}>
            <ActionIcon variant="subtle" onClick={toggle} aria-label="Tela cheia">
              {fullscreen ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Sair do modo TV">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => {
                if (fullscreen) toggle();
                navigate(-1);
              }}
              aria-label="Sair do modo TV"
            >
              <IconX size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Paper>
    </Box>
  );
}
