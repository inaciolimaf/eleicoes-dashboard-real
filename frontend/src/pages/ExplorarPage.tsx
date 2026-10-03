import { ActionIcon, Badge, Box, Button, Card, Grid, Group, Menu, SegmentedControl, Select, Stack, Switch, Text, Title, Tooltip } from "@mantine/core";
import { IconArrowUp, IconDownload, IconMaximize, IconStar, IconStarFilled } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useResultados } from "../api/hooks";
import type { Nivel } from "../api/types";
import { BlocoTotais } from "../components/resultados/BlocoTotais";
import { Placar } from "../components/resultados/Placar";
import { ComResultados, EscolhaUf, useCargoSemResultadoBr } from "../components/resultados/ComResultados";
import { MapaEleitoral, TIPOS_MAPA, type TipoMapa } from "../components/mapas";
import { TabelaRecortes } from "../components/tabelas/TabelaRecortes";
import { Evolucao } from "../components/graficos/Evolucao";
import { HeatmapProgresso } from "../components/graficos/HeatmapProgresso";
import { FeedEventos } from "../components/eventos/FeedEventos";
import { FiltroProvider, useFiltroEfetivo } from "../lib/filtro-efetivo";
import { NIVEL_PLURAL, NIVEL_ROTULO, isNivel, linkRecorte, nivelFilho, nomeRecortePadrao } from "../lib/recortes";
import { NOME_CARGO, sistemaPadrao } from "../lib/cargos";
import { exportarDados } from "../lib/exportar";
import { useFiltro } from "../store/filtro";
import { useFavoritos } from "../store/favoritos";

function Secao({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
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

function ConteudoExplorar({ nivel, id }: { nivel: Nivel; id: string }) {
  const f = useFiltroEfetivo();
  const navigate = useNavigate();
  const semBr = useCargoSemResultadoBr(f.cargo, nivel);
  const res = useResultados({ turno: f.turno, cargo: f.cargo, nivel, id, t: f.t }, !semBr);
  const proporcional = (res.data?.cargo.sistema ?? sistemaPadrao(f.cargo)) === "proporcional";
  const [tipoMapa, setTipoMapa] = useState<TipoMapa>("vencedores");
  const [todosMun, setTodosMun] = useState(false);
  const [eixo, setEixo] = useState<"t" | "pct_secoes">("t");
  const [metrica, setMetrica] = useState<"pct" | "votos" | "diferenca">("pct");
  const { eFavorito, alternar } = useFavoritos();
  const filho = nivelFilho(nivel);
  const nome = res.data?.recorte.nome ?? nomeRecortePadrao(nivel, id);
  const ir = (n: Nivel, i: string, nm?: string) => {
    if (n !== "local" && n !== "secao") useFiltro.getState().setRecorte(n, i, nm);
    navigate(linkRecorte(n, i));
  };
  const pai = res.data?.recorte.breadcrumb?.[res.data.recorte.breadcrumb.length - 2];
  const fav = eFavorito("recorte", `${nivel}:${id}`);
  const filhosParam: Nivel | null = nivel === "br" && todosMun ? "municipio" : null;

  const tiposMapa = TIPOS_MAPA.filter((t) => !t.proporcional || proporcional);
  const mapa = (
    <Secao
      titulo={`Mapa · ${nivel === "br" ? (todosMun ? "municípios" : "UFs") : nivel === "uf" ? "municípios" : "locais de votação"}`}
      extra={
        <Group gap="xs">
          {nivel === "br" && <Switch size="xs" label="Todos os municípios" checked={todosMun} onChange={(e) => setTodosMun(e.currentTarget.checked)} />}
          <Select
            size="xs"
            w={190}
            data={tiposMapa.map((t) => ({ value: t.valor, label: t.rotulo }))}
            value={tipoMapa}
            onChange={(v) => v && setTipoMapa(v as TipoMapa)}
            allowDeselect={false}
            aria-label="Tipo de mapa"
          />
          <Tooltip label="Abrir em tela cheia">
            <ActionIcon variant="default" onClick={() => navigate(`/mapas?tipo=${tipoMapa}${todosMun ? "&mun=1" : ""}`)} aria-label="Mapa em tela cheia">
              <IconMaximize size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      }
    >
      <Box h={{ base: 380, md: 520 }} style={{ borderRadius: 12, overflow: "hidden" }}>
        <MapaEleitoral tipo={tipoMapa} nivel={nivel} id={id} todosMunicipios={todosMun} onSelecionar={ir} />
      </Box>
    </Secao>
  );

  const tabela = filho && (
    <Secao
      titulo={`${NIVEL_PLURAL[nivel === "br" && todosMun ? "municipio" : filho]} de ${nome}`}
      extra={
        <Menu position="bottom-end">
          <Menu.Target>
            <Button size="xs" variant="default" leftSection={<IconDownload size={14} />}>
              Exportar
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => exportarDados("filhos", "csv", { ...f, nivel, id, filhos: filhosParam })}>CSV</Menu.Item>
            <Menu.Item onClick={() => exportarDados("filhos", "json", { ...f, nivel, id, filhos: filhosParam })}>JSON</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      }
    >
      <TabelaRecortes
        nivel={nivel}
        id={id}
        filhos={filhosParam}
        colunas={
          nivel === "br" && !todosMun
            ? ["nome", "regiao", "pct_secoes", "lider", "segundo", "margem_pp", "votos_validos", "eleitorado", "comparecimento"]
            : proporcional
              ? ["nome", "pct_secoes", "lider", "partido", "votos_validos", "eleitorado", "abstencao"]
              : ["nome", "pct_secoes", "lider", "segundo", "margem_pp", "votos_validos", "eleitorado", "capital", "abstencao"]
        }
        onSelecionar={ir}
      />
    </Secao>
  );

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={2}>
          <Group gap={6}>
            <Badge variant="light">{NIVEL_ROTULO[nivel]}</Badge>
            <Badge variant="outline" color="gray">
              {NOME_CARGO[f.cargo] ?? f.cargo}
            </Badge>
          </Group>
          <Group gap={6} wrap="nowrap">
            <Title order={2} lineClamp={1}>
              {nome}
            </Title>
            <Tooltip label={fav ? "Remover dos favoritos" : "Favoritar"}>
              <ActionIcon variant="subtle" color="yellow" onClick={() => alternar({ tipo: "recorte", ref: `${nivel}:${id}`, rotulo: nome })} aria-label="Favoritar">
                {fav ? <IconStarFilled size={18} /> : <IconStar size={18} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Stack>
        <Group gap="xs">
          {pai && (
            <Button size="xs" variant="default" leftSection={<IconArrowUp size={14} />} onClick={() => ir(pai.nivel, pai.id, pai.nome)}>
              {pai.nome}
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
                <Menu.Item onClick={() => exportarDados("resultados", "csv", { ...f, nivel, id })}>CSV</Menu.Item>
                <Menu.Item onClick={() => exportarDados("resultados", "json", { ...f, nivel, id })}>JSON</Menu.Item>
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
                <EscolhaUf cargo={f.cargo} onUf={(uf, nm) => ir("uf", uf, nm)} />
              </Card>
              <Secao titulo="Progresso por UF">
                <HeatmapProgresso onSelecionarUf={(uf, nm) => ir("uf", uf, nm)} />
              </Secao>
            </Stack>
          </Grid.Col>
          <Grid.Col span={12}>{tabela}</Grid.Col>
        </Grid>
      ) : (
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="md">
              <Card p="md">
                <ComResultados nivel={nivel} id={id}>
                  {(r) => <BlocoTotais res={r} />}
                </ComResultados>
              </Card>
              <Card p="md">
                <ComResultados nivel={nivel} id={id} linhasSkeleton={6}>
                  {(r) => <Placar res={r} />}
                </ComResultados>
              </Card>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Stack gap="md">
              {nivel !== "secao" && mapa}
              <Secao
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
                <Evolucao nivel={nivel} id={id} eixoX={eixo} metrica={metrica} altura={300} />
              </Secao>
            </Stack>
          </Grid.Col>
          {tabela && <Grid.Col span={{ base: 12, lg: 8 }}>{tabela}</Grid.Col>}
          <Grid.Col span={{ base: 12, lg: tabela ? 4 : 12 }}>
            <Secao titulo="Eventos deste recorte">
              <FeedEventos nivel={nivel} id={id} cargo={f.cargo} limite={30} alturaMax={520} />
            </Secao>
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}

export default function ExplorarPage() {
  const params = useParams();
  const g = useFiltro();
  const nivel = isNivel(params.nivel) ? params.nivel : null;
  const id = params.id ? decodeURIComponent(params.id) : nivel === "br" ? "br" : null;

  useEffect(() => {
    if (nivel && id && (g.nivel !== nivel || g.id !== id)) g.setRecorte(nivel, id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, id]);

  if (!nivel || !id) return <Navigate to={linkRecorte(g.nivel === "local" || g.nivel === "secao" ? "br" : g.nivel, g.nivel === "local" || g.nivel === "secao" ? "br" : g.id)} replace />;
  if (nivel === "local") return <Navigate to={`/locais/${encodeURIComponent(id)}`} replace />;
  if (nivel === "secao") return <Navigate to={`/secoes/${encodeURIComponent(id)}`} replace />;
  return (
    <FiltroProvider value={{ nivel, id }}>
      <ConteudoExplorar key={`${nivel}:${id}`} nivel={nivel} id={id} />
    </FiltroProvider>
  );
}
