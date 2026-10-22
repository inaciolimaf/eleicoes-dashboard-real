import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Menu,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconArrowUp, IconDownload, IconMaximize, IconStar, IconStarFilled } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, type Params } from "react-router-dom";
import { useResults } from "../hooks";
import { Level } from "../../../api/models";
import { TotalsBlock } from "./TotalsBlock";
import { Scoreboard } from "./Scoreboard";
import { WithResults, StateChoice, useOfficeWithoutBrResult } from "./WithResults";
import { ElectoralMap, MAP_TYPES, type MapType } from "../../maps";
import { GeoAreaTable } from "./GeoAreaTable";
import { Evolution } from "../../charts";
import { ProgressHeatmap } from "../../charts";
import { EventFeed } from "../../events";
import { FilterProvider, useEffectiveFilter } from "../../../lib/effective-filter";
import {
  LEVEL_PLURAL_LABELS,
  LEVEL_LABELS,
  levelOfSegment,
  geoAreaLink,
  childLevel,
  defaultGeoAreaName,
} from "../../../lib/geo-areas";
import { OFFICE_NAME, defaultSystem } from "../../../lib/offices";
import { exportData } from "../../../lib/export";
import { useFilter } from "../../../lib/filter-store";
import { useFavorites } from "../../accounts";
import { asLevel } from "../../../lib/geo-areas";

function Block({
  titulo,
  children,
  extra,
}: {
  titulo: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <Card p="md">
      <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
        <Text fw={700}>{titulo}</Text>
        {extra}
      </Group>
      {children}
    </Card>
  );
}

function ConteudoExplorar({ nivel, id }: { nivel: Level; id: string }) {
  const f = useEffectiveFilter();
  const navigate = useNavigate();
  const semBr = useOfficeWithoutBrResult(f.cargo, nivel);
  const res = useResults({ turno: f.turno, cargo: f.cargo, nivel, id, t: f.t }, !semBr);
  const proporcional = (res.data?.office.voting_system ?? defaultSystem(f.cargo)) === "proporcional";
  const [tipoMapa, setTipoMapa] = useState<MapType>("vencedores");
  const [todosMun, setTodosMun] = useState(false);
  const [eixo, setEixo] = useState<"t" | "pct_secoes">("t");
  const [metrica, setMetrica] = useState<"pct" | "votos" | "diferenca">("pct");
  const { eFavorito, alternar } = useFavorites();
  const filho = childLevel(nivel);
  const nome = res.data?.geo_area.name ?? defaultGeoAreaName(nivel, id);
  const ir = (n: Level, i: string, nm?: string) => {
    if (n !== "polling_place" && n !== "section") useFilter.getState().setRecorte(n, i, nm);
    navigate(geoAreaLink(n, i));
  };
  const pai = res.data?.geo_area.breadcrumb?.[res.data.geo_area.breadcrumb.length - 2];
  const fav = eFavorito("geo_area", `${nivel}:${id}`);
  const filhosParam: Level | null = nivel === "country" && todosMun ? "municipality" : null;

  const tiposMapa = MAP_TYPES.filter((t) => !t.proporcional || proporcional);
  const mapa = (
    <Block
      titulo={`Mapa · ${nivel === "country" ? (todosMun ? "municípios" : "UFs") : nivel === "state" ? "municípios" : "locais de votação"}`}
      extra={
        <Group gap="xs">
          {nivel === "country" && (
            <Switch
              size="xs"
              label="Todos os municípios"
              checked={todosMun}
              onChange={(e) => setTodosMun(e.currentTarget.checked)}
            />
          )}
          <Select
            size="xs"
            w={190}
            data={tiposMapa.map((t) => ({ value: t.valor, label: t.rotulo }))}
            value={tipoMapa}
            onChange={(v) => v && setTipoMapa(v as MapType)}
            allowDeselect={false}
            aria-label="Tipo de mapa"
          />
          <Tooltip label="Abrir em tela cheia">
            <ActionIcon
              variant="default"
              onClick={() => navigate(`/mapas?tipo=${tipoMapa}${todosMun ? "&mun=1" : ""}`)}
              aria-label="Mapa em tela cheia"
            >
              <IconMaximize size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      }
    >
      <Box h={{ base: 380, md: 520 }} style={{ borderRadius: 12, overflow: "hidden" }}>
        <ElectoralMap tipo={tipoMapa} nivel={nivel} id={id} todosMunicipios={todosMun} onSelecionar={ir} />
      </Box>
    </Block>
  );

  const tabela = filho && (
    <Block
      titulo={`${LEVEL_PLURAL_LABELS[nivel === "country" && todosMun ? "municipality" : filho]} de ${nome}`}
      extra={
        <Menu position="bottom-end">
          <Menu.Target>
            <Button size="xs" variant="default" leftSection={<IconDownload size={14} />}>
              Exportar
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => exportData("filhos", "csv", { ...f, nivel, id, filhos: filhosParam })}>
              CSV
            </Menu.Item>
            <Menu.Item onClick={() => exportData("filhos", "json", { ...f, nivel, id, filhos: filhosParam })}>
              JSON
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      }
    >
      <GeoAreaTable
        nivel={nivel}
        id={id}
        filhos={filhosParam}
        colunas={
          nivel === "country" && !todosMun
            ? [
                "nome",
                "regiao",
                "pct_secoes",
                "lider",
                "segundo",
                "margem_pp",
                "votos_validos",
                "eleitorado",
                "comparecimento",
              ]
            : proporcional
              ? ["nome", "pct_secoes", "lider", "partido", "votos_validos", "eleitorado", "abstencao"]
              : [
                  "nome",
                  "pct_secoes",
                  "lider",
                  "segundo",
                  "margem_pp",
                  "votos_validos",
                  "eleitorado",
                  "capital",
                  "abstencao",
                ]
        }
        onSelecionar={ir}
      />
    </Block>
  );

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={2}>
          <Group gap={6}>
            <Badge variant="light">{LEVEL_LABELS[nivel]}</Badge>
            <Badge variant="outline" color="gray">
              {OFFICE_NAME[f.cargo] ?? f.cargo}
            </Badge>
          </Group>
          <Group gap={6} wrap="nowrap">
            <Title order={2} lineClamp={1}>
              {nome}
            </Title>
            <Tooltip label={fav ? "Remover dos favoritos" : "Favoritar"}>
              <ActionIcon
                variant="subtle"
                color="yellow"
                onClick={() => alternar({ type: "geo_area", ref: `${nivel}:${id}`, label: nome })}
                aria-label="Favoritar"
              >
                {fav ? <IconStarFilled size={18} /> : <IconStar size={18} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Stack>
        <Group gap="xs">
          {pai && (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconArrowUp size={14} />}
              onClick={() => ir(asLevel(pai.level), pai.id, pai.name)}
            >
              {pai.name}
            </Button>
          )}
          {!semBr && (
            <Menu position="bottom-end">
              <Menu.Target>
                <Button size="xs" variant="default" leftSection={<IconDownload size={14} />}>
                  Resultado
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => exportData("resultados", "csv", { ...f, nivel, id })}>
                  CSV
                </Menu.Item>
                <Menu.Item onClick={() => exportData("resultados", "json", { ...f, nivel, id })}>
                  JSON
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>

      {semBr ? (
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 7 }}>{mapa}</Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="md">
              <Card p="md">
                <StateChoice cargo={f.cargo} onUf={(uf, nm) => ir("state", uf, nm)} />
              </Card>
              <Block titulo="Progresso por UF">
                <ProgressHeatmap onSelecionarUf={(uf, nm) => ir("state", uf, nm)} />
              </Block>
            </Stack>
          </Grid.Col>
          <Grid.Col span={12}>{tabela}</Grid.Col>
        </Grid>
      ) : (
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="md">
              <Card p="md">
                <WithResults nivel={nivel} id={id}>
                  {(r) => <TotalsBlock res={r} />}
                </WithResults>
              </Card>
              <Card p="md">
                <WithResults nivel={nivel} id={id} linhasSkeleton={6}>
                  {(r) => <Scoreboard res={r} />}
                </WithResults>
              </Card>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Stack gap="md">
              {nivel !== "section" && mapa}
              <Block
                titulo="Evolução da apuração"
                extra={
                  <Group gap="xs">
                    <SegmentedControl
                      size="xs"
                      value={eixo}
                      onChange={(v) => setEixo(v as typeof eixo)}
                      data={[
                        { value: "t", label: "× horário" },
                        { value: "pct_secoes", label: "× % seções" },
                      ]}
                    />
                    <SegmentedControl
                      size="xs"
                      value={metrica}
                      onChange={(v) => setMetrica(v as typeof metrica)}
                      data={[
                        { value: "pct", label: "%" },
                        { value: "votos", label: "Votos" },
                        { value: "diferenca", label: "1º − 2º" },
                      ]}
                    />
                  </Group>
                }
              >
                <Evolution nivel={nivel} id={id} eixoX={eixo} metrica={metrica} altura={300} />
              </Block>
            </Stack>
          </Grid.Col>
          {tabela && <Grid.Col span={{ base: 12, lg: 8 }}>{tabela}</Grid.Col>}
          <Grid.Col span={{ base: 12, lg: tabela ? 4 : 12 }}>
            <Block titulo="Eventos deste recorte">
              <EventFeed nivel={nivel} id={id} cargo={f.cargo} limite={30} alturaMax={520} />
            </Block>
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}

export function ExploreScreen({ params }: { params: Params }) {
  const g = useFilter();
  const nivel = levelOfSegment(params.nivel);
  const id = params.id ? decodeURIComponent(params.id) : nivel === "country" ? "br" : null;

  useEffect(() => {
    if (nivel && id && (g.nivel !== nivel || g.id !== id)) g.setRecorte(nivel, id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, id]);

  if (!nivel || !id)
    return (
      <Navigate
        to={geoAreaLink(
          g.nivel === "polling_place" || g.nivel === "section" ? "country" : g.nivel,
          g.nivel === "polling_place" || g.nivel === "section" ? "br" : g.id,
        )}
        replace
      />
    );
  if (nivel === "polling_place") return <Navigate to={`/locais/${encodeURIComponent(id)}`} replace />;
  if (nivel === "section") return <Navigate to={`/secoes/${encodeURIComponent(id)}`} replace />;
  return (
    <FilterProvider value={{ nivel, id }}>
      <ConteudoExplorar key={`${nivel}:${id}`} nivel={nivel} id={id} />
    </FilterProvider>
  );
}
