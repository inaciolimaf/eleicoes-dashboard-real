import { ActionIcon, Badge, Box, Button, Card, Drawer, Group, ScrollArea, Stack, Switch, Text, ThemeIcon, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconAdjustments, IconArrowUp, IconCompass } from "@tabler/icons-react";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useResultados } from "../api/hooks";
import type { Nivel } from "../api/types";
import { MapaEleitoral, TIPOS_MAPA, type TipoMapa } from "../components/mapas";
import { ComResultados, useCargoSemResultadoBr } from "../components/resultados/ComResultados";
import { Placar } from "../components/resultados/Placar";
import { useFiltroEfetivo } from "../lib/filtro-efetivo";
import { linkRecorte, nomeRecortePadrao, zonaDoId } from "../lib/recortes";
import { sistemaPadrao } from "../lib/cargos";
import { fmtPct } from "../lib/format";
import { useFiltro } from "../store/filtro";
import { usePrefs } from "../store/prefs";

/** Mapa em tela cheia com seletor de tipo (RF-05) e painel lateral. */
export default function MapasPage() {
  const [sp, setSp] = useSearchParams();
  const f = useFiltroEfetivo();
  const g = useFiltro();
  const navigate = useNavigate();
  const basemap = usePrefs((s) => s.basemap);
  const setPrefs = usePrefs((s) => s.set);
  const celular = useMediaQuery("(max-width: 62em)");
  const [painelAberto, { open, close }] = useDisclosure(false);
  const tipo = (sp.get("tipo") as TipoMapa) || "vencedores";
  const todosMun = sp.get("mun") === "1";
  const semBr = useCargoSemResultadoBr(f.cargo, f.nivel);
  const res = useResultados({ turno: f.turno, cargo: f.cargo, nivel: f.nivel, id: f.id, t: f.t }, !semBr);
  const proporcional = (res.data?.cargo.sistema ?? sistemaPadrao(f.cargo)) === "proporcional";
  const nivelMapa: Nivel = f.nivel === "secao" ? "zona" : f.nivel;
  const idMapa = f.nivel === "secao" ? zonaDoId("secao", f.id) ?? f.id : f.id;
  const pai = res.data?.recorte.breadcrumb?.[res.data.recorte.breadcrumb.length - 2];

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v === null) n.delete(k);
    else n.set(k, v);
    setSp(n, { replace: true });
  };

  const selecionar = (nivel: Nivel, id: string, nome: string) => {
    if (nivel === "local" || nivel === "secao") navigate(linkRecorte(nivel, id));
    else g.setRecorte(nivel, id, nome);
  };

  const tipos = useMemo(() => TIPOS_MAPA.filter((t) => !t.proporcional || proporcional), [proporcional]);

  const lateral = (
    <Stack gap="sm">
      <Group justify="space-between">
        <Stack gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Recorte
          </Text>
          <Text fw={800} size="lg" lineClamp={1}>
            {res.data?.recorte.nome ?? g.nome ?? nomeRecortePadrao(f.nivel, f.id)}
          </Text>
          {res.data && !res.data.sem_dados && (
            <Text size="xs" c="dimmed">
              {fmtPct(res.data.totais.pct_secoes)} das seções apuradas
            </Text>
          )}
        </Stack>
        <Group gap={4}>
          {pai && (
            <Tooltip label={`Subir para ${pai.nome}`}>
              <ActionIcon variant="default" onClick={() => g.setRecorte(pai.nivel, pai.id, pai.nome)} aria-label="Subir um nível">
                <IconArrowUp size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Explorar este recorte">
            <ActionIcon variant="default" onClick={() => navigate(linkRecorte(f.nivel, f.id))} aria-label="Explorar">
              <IconCompass size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        Tipo de mapa
      </Text>
      <Stack gap={4}>
        {tipos.map((t) => (
          <UnstyledButton key={t.valor} onClick={() => setParam("tipo", t.valor)}>
            <Card
              p="xs"
              withBorder
              style={{ borderColor: tipo === t.valor ? "var(--mantine-color-eleicao-4)" : undefined, background: tipo === t.valor ? "var(--mantine-color-default-hover)" : undefined }}
            >
              <Text size="sm" fw={700}>
                {t.rotulo}
              </Text>
              <Text size="xs" c="dimmed">
                {t.descricao}
              </Text>
            </Card>
          </UnstyledButton>
        ))}
      </Stack>
      {f.nivel === "br" && (
        <Switch label="Todos os municípios do Brasil" checked={todosMun} onChange={(e) => setParam("mun", e.currentTarget.checked ? "1" : null)} />
      )}
      <Switch label="Mapa de fundo" checked={basemap} onChange={(e) => setPrefs({ basemap: e.currentTarget.checked })} />
      {!semBr && (
        <Card p="sm" withBorder>
          <ComResultados linhasSkeleton={3}>{(r) => <Placar res={r} opcoes={{ topN: 5, mostrarFotos: false }} />}</ComResultados>
        </Card>
      )}
    </Stack>
  );

  return (
    <Box pos="relative" style={{ height: "calc(100dvh - 60px - 64px - 46px - 32px)", minHeight: 420 }}>
      <Group gap="md" h="100%" wrap="nowrap" align="stretch">
        <Box style={{ flex: 1, minWidth: 0, borderRadius: 14, overflow: "hidden", border: "1px solid var(--mantine-color-default-border)" }}>
          <MapaEleitoral tipo={tipo} nivel={nivelMapa} id={idMapa} todosMunicipios={todosMun} onSelecionar={selecionar} altura="100%" />
        </Box>
        {!celular && (
          <Card w={330} p="sm" style={{ flexShrink: 0 }}>
            <ScrollArea h="100%" className="scroll-fino">
              {lateral}
            </ScrollArea>
          </Card>
        )}
      </Group>
      {celular && (
        <>
          <Button
            leftSection={<IconAdjustments size={16} />}
            onClick={open}
            style={{ position: "absolute", bottom: 12, right: 12, zIndex: 20 }}
            radius="xl"
            size="sm"
            variant="filled"
          >
            {TIPOS_MAPA.find((t) => t.valor === tipo)?.rotulo}
          </Button>
          <Drawer opened={painelAberto} onClose={close} position="bottom" size="75%" title={<Group gap={6}><ThemeIcon size="sm" variant="light"><IconAdjustments size={14} /></ThemeIcon><Text fw={700}>Mapa</Text><Badge size="xs">{f.nivel}</Badge></Group>}>
            {lateral}
          </Drawer>
        </>
      )}
    </Box>
  );
}
