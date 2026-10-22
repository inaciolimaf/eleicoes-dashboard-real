import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconAdjustments, IconArrowUp, IconCompass } from "@tabler/icons-react";
import { useMemo } from "react";
import { useNavigate, type SetURLSearchParams } from "react-router-dom";
import { useResults } from "../../results";
import { Level } from "../../../api/models";
import { ElectoralMap } from "./ElectoralMap";
import { MAP_TYPES, type MapType } from "../types";
import { WithResults, useOfficeWithoutBrResult } from "../../results";
import { Scoreboard } from "../../results";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { geoAreaLink, defaultGeoAreaName, zoneOfId } from "../../../lib/geo-areas";
import { defaultSystem } from "../../../lib/offices";
import { fmtPct } from "../../../lib/formatting";
import { useFilter } from "../../../lib/filter-store";
import { usePrefs } from "../../../lib/prefs-store";
import { asLevel } from "../../../lib/geo-areas";

/** Mapa em tela cheia com seletor de tipo (RF-05) e painel lateral. */
export function MapsScreen({ sp, setSp }: { sp: URLSearchParams; setSp: SetURLSearchParams }) {
  const f = useEffectiveFilter();
  const g = useFilter();
  const navigate = useNavigate();
  const basemap = usePrefs((s) => s.basemap);
  const setPrefs = usePrefs((s) => s.set);
  const celular = useMediaQuery("(max-width: 62em)");
  const [painelAberto, { open, close }] = useDisclosure(false);
  const tipo = (sp.get("tipo") as MapType) || "vencedores";
  const todosMun = sp.get("mun") === "1";
  const semBr = useOfficeWithoutBrResult(f.cargo, f.nivel);
  const res = useResults({ turno: f.turno, cargo: f.cargo, nivel: f.nivel, id: f.id, t: f.t }, !semBr);
  const proporcional = (res.data?.office.voting_system ?? defaultSystem(f.cargo)) === "proporcional";
  const nivelMapa: Level = f.nivel === "section" ? "zone" : f.nivel;
  const idMapa = f.nivel === "section" ? (zoneOfId("section", f.id) ?? f.id) : f.id;
  const pai = res.data?.geo_area.breadcrumb?.[res.data.geo_area.breadcrumb.length - 2];

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v === null) n.delete(k);
    else n.set(k, v);
    setSp(n, { replace: true });
  };

  const selecionar = (nivel: Level, id: string, nome: string) => {
    if (nivel === "polling_place" || nivel === "section") navigate(geoAreaLink(nivel, id));
    else g.setRecorte(nivel, id, nome);
  };

  const tipos = useMemo(() => MAP_TYPES.filter((t) => !t.proporcional || proporcional), [proporcional]);

  const lateral = (
    <Stack gap="sm">
      <Group justify="space-between">
        <Stack gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Recorte
          </Text>
          <Text fw={800} size="lg" lineClamp={1}>
            {res.data?.geo_area.name ?? g.nome ?? defaultGeoAreaName(f.nivel, f.id)}
          </Text>
          {res.data && !res.data.no_data && (
            <Text size="xs" c="dimmed">
              {fmtPct(res.data.totals.pct_sections)} das seções apuradas
            </Text>
          )}
        </Stack>
        <Group gap={4}>
          {pai && (
            <Tooltip label={`Subir para ${pai.name}`}>
              <ActionIcon
                variant="default"
                onClick={() => g.setRecorte(asLevel(pai.level), pai.id, pai.name)}
                aria-label="Subir um nível"
              >
                <IconArrowUp size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Explorar este recorte">
            <ActionIcon
              variant="default"
              onClick={() => navigate(geoAreaLink(f.nivel, f.id))}
              aria-label="Explorar"
            >
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
              style={{
                borderColor: tipo === t.valor ? "var(--mantine-color-eleicao-4)" : undefined,
                background: tipo === t.valor ? "var(--mantine-color-default-hover)" : undefined,
              }}
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
      {f.nivel === "country" && (
        <Switch
          label="Todos os municípios do Brasil"
          checked={todosMun}
          onChange={(e) => setParam("mun", e.currentTarget.checked ? "1" : null)}
        />
      )}
      <Switch
        label="Mapa de fundo"
        checked={basemap}
        onChange={(e) => setPrefs({ basemap: e.currentTarget.checked })}
      />
      {!semBr && (
        <Card p="sm" withBorder>
          <WithResults linhasSkeleton={3}>
            {(r) => <Scoreboard res={r} opcoes={{ topN: 5, mostrarFotos: false }} />}
          </WithResults>
        </Card>
      )}
    </Stack>
  );

  return (
    <Box pos="relative" style={{ height: "calc(100dvh - 60px - 64px - 46px - 32px)", minHeight: 420 }}>
      <Group gap="md" h="100%" wrap="nowrap" align="stretch">
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <ElectoralMap
            tipo={tipo}
            nivel={nivelMapa}
            id={idMapa}
            todosMunicipios={todosMun}
            onSelecionar={selecionar}
            altura="100%"
          />
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
            {MAP_TYPES.find((t) => t.valor === tipo)?.rotulo}
          </Button>
          <Drawer
            opened={painelAberto}
            onClose={close}
            position="bottom"
            size="75%"
            title={
              <Group gap={6}>
                <ThemeIcon size="sm" variant="light">
                  <IconAdjustments size={14} />
                </ThemeIcon>
                <Text fw={700}>Mapa</Text>
                <Badge size="xs">{f.nivel}</Badge>
              </Group>
            }
          >
            {lateral}
          </Drawer>
        </>
      )}
    </Box>
  );
}
