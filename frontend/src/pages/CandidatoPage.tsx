import { ActionIcon, Box, Card, Grid, Group, Pagination, Progress, ScrollArea, SegmentedControl, Stack, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { IconSearch, IconStar, IconStarFilled } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCandidato, useFilhos } from "../api/hooks";
import type { Nivel } from "../api/types";
import { CardCandidato } from "../components/resultados/CardCandidato";
import { MapaEleitoral } from "../components/mapas";
import { Carregando, ErroView, SemDados } from "../components/common/Estados";
import { FiltroProvider, useFiltroEfetivo } from "../lib/filtro-efetivo";
import { fmtInt, fmtPct, semAcento } from "../lib/format";
import { linkRecorte, NIVEL_PLURAL } from "../lib/recortes";
import { useCorCandidato } from "../lib/useCor";
import { useFavoritos } from "../store/favoritos";
import { useFiltro } from "../store/filtro";

function TabelaDesempenho({ sq, nivel, id, filhos }: { sq: string; nivel: Nivel; id: string; filhos: Nivel | null }) {
  const f = useFiltroEfetivo();
  const q = useFilhos({ turno: f.turno, cargo: f.cargo, nivel, id, t: f.t, filhos, candidatos: [sq] });
  const [busca, setBusca] = useState("");
  const [pag, setPag] = useState(1);
  const navigate = useNavigate();
  const corCand = useCorCandidato();
  const lista = useMemo(() => {
    const b = semAcento(busca);
    return [...(q.data?.itens ?? [])]
      .filter((i) => !b || semAcento(i.nome).includes(b))
      .sort((a, b2) => (b2.valores?.[sq] ?? -1) - (a.valores?.[sq] ?? -1));
  }, [q.data, busca, sq]);
  if (q.isLoading) return <Carregando linhas={5} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  if (!lista.length && !busca) return <SemDados />;
  const vitorias = q.data?.candidatos.find((c) => c.sqcand === sq)?.vitorias ?? 0;
  const POR = 15;
  const total = Math.max(1, Math.ceil(lista.length / POR));
  const pagina = Math.min(pag, total);
  const nivelF = q.data?.nivel_filhos ?? "uf";
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm">
          Venceu em <b className="num">{fmtInt(vitorias)}</b> de {fmtInt(q.data?.itens.length ?? 0)} {NIVEL_PLURAL[nivelF].toLowerCase()}
        </Text>
        <TextInput size="xs" placeholder="Filtrar…" leftSection={<IconSearch size={14} />} value={busca} onChange={(e) => { setBusca(e.currentTarget.value); setPag(1); }} w={180} />
      </Group>
      <ScrollArea>
        <Table highlightOnHover verticalSpacing={4} fz="sm" miw={480}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{nivelF === "uf" ? "UF" : "Município"}</Table.Th>
              <Table.Th ta="right">% do candidato</Table.Th>
              <Table.Th>Líder</Table.Th>
              <Table.Th ta="right">% apurado</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.slice((pagina - 1) * POR, pagina * POR).map((i) => {
              const v = i.valores?.[sq];
              const lidera = i.lider?.sqcand === sq;
              return (
                <Table.Tr key={i.id} style={{ cursor: "pointer" }} onClick={() => { useFiltro.getState().setRecorte(i.nivel, i.id, i.nome); navigate(linkRecorte(i.nivel, i.id)); }}>
                  <Table.Td fw={600}>
                    {i.nome}
                    {i.nivel === "municipio" ? <Text span c="dimmed" size="xs"> · {i.uf.toUpperCase()}</Text> : null}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Stack gap={2} align="flex-end">
                      <Text size="sm" className="num" fw={lidera ? 800 : 500}>
                        {fmtPct(v)}
                      </Text>
                      <Progress value={v ?? 0} size={4} w={90} color={corCand(sq, undefined)} />
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    {i.lider ? (
                      <Group gap={6} wrap="nowrap">
                        <Box w={8} h={8} style={{ borderRadius: 8, background: corCand(i.lider.sqcand, i.lider.cor) }} />
                        <Text size="sm" fw={lidera ? 700 : 400}>
                          {i.lider.nome_urna}
                        </Text>
                      </Group>
                    ) : (
                      "—"
                    )}
                  </Table.Td>
                  <Table.Td ta="right" className="num">
                    {fmtPct(i.pct_secoes, 1)}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {total > 1 && <Pagination size="sm" total={total} value={pagina} onChange={setPag} />}
    </Stack>
  );
}

export default function CandidatoPage() {
  const sq = decodeURIComponent(useParams().sqcand ?? "");
  const f = useFiltroEfetivo();
  const q = useCandidato(sq, f.turno, f.t);
  const { eFavorito, alternar } = useFavoritos();
  const [visao, setVisao] = useState<"uf" | "municipio">("uf");
  const navigate = useNavigate();
  const c = q.data;
  const cargo = c ? Number(c.cargo.cd) : f.cargo;
  const uf = c?.uf ?? null;
  // presidente: mapa por UF e por município; demais: municípios da UF do candidato
  const nivel: Nivel = uf ? "uf" : "br";
  const id = uf ?? "br";
  const todosMun = !uf && visao === "municipio";
  const fav = eFavorito("candidato", sq);
  return (
    <FiltroProvider value={{ cargo }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>{c?.nome_urna ?? "Candidato"}</Title>
          <Tooltip label={fav ? "Remover dos favoritos" : "Favoritar candidato"}>
            <ActionIcon variant="subtle" color="yellow" size="lg" onClick={() => alternar({ tipo: "candidato", ref: sq, rotulo: c?.nome_urna ?? sq })} aria-label="Favoritar candidato">
              {fav ? <IconStarFilled size={20} /> : <IconStar size={20} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <CardCandidato sqcand={sq} grande link={false} />
        {c && (
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <Card p="md">
                <Group justify="space-between" mb="sm">
                  <Text fw={700}>Desempenho por região</Text>
                  {!uf && (
                    <SegmentedControl
                      size="xs"
                      value={visao}
                      onChange={(v) => setVisao(v as typeof visao)}
                      data={[
                        { value: "uf", label: "Por UF" },
                        { value: "municipio", label: "Por município" },
                      ]}
                    />
                  )}
                </Group>
                <Box h={{ base: 380, md: 520 }} style={{ borderRadius: 12, overflow: "hidden" }}>
                  <MapaEleitoral
                    tipo="desempenho"
                    nivel={nivel}
                    id={id}
                    todosMunicipios={todosMun}
                    candidatoA={sq}
                    seletorCandidatos={false}
                    cargo={cargo}
                    onSelecionar={(n, i, nome) => {
                      useFiltro.getState().setRecorte(n, i, nome);
                      navigate(linkRecorte(n, i));
                    }}
                  />
                </Box>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <Card p="md">
                <Text fw={700} mb="sm">
                  {todosMun || uf ? "Municípios" : "UFs"} — onde foi melhor
                </Text>
                <TabelaDesempenho sq={sq} nivel={nivel} id={id} filhos={todosMun ? "municipio" : null} />
              </Card>
            </Grid.Col>
          </Grid>
        )}
        {q.error && <ErroView erro={q.error} onRetry={() => q.refetch()} />}
      </Stack>
    </FiltroProvider>
  );
}
