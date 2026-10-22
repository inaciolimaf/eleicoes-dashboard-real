import {
  ActionIcon,
  Box,
  Card,
  Grid,
  Group,
  Pagination,
  Progress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconSearch, IconStar, IconStarFilled } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCandidate, useChildren } from "../hooks";
import { Level } from "../../../api/models";
import { CandidateCard } from "./CandidateCard";
import { ElectoralMap } from "../../maps";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { FilterProvider, useEffectiveFilter } from "../../../lib/effective-filter";
import { fmtInt, fmtPct, stripAccents } from "../../../lib/formatting";
import { geoAreaLink, LEVEL_PLURAL_LABELS } from "../../../lib/geo-areas";
import { useCandidateColor } from "../../../lib/useColor";
import { useFavorites } from "../../accounts";
import { useFilter } from "../../../lib/filter-store";
import { asLevel } from "../../../lib/geo-areas";

function TabelaDesempenho({
  sq,
  nivel,
  id,
  filhos,
}: {
  sq: string;
  nivel: Level;
  id: string;
  filhos: Level | null;
}) {
  const f = useEffectiveFilter();
  const q = useChildren({ turno: f.turno, cargo: f.cargo, nivel, id, t: f.t, filhos, candidatos: [sq] });
  const [busca, setBusca] = useState("");
  const [pag, setPag] = useState(1);
  const navigate = useNavigate();
  const corCand = useCandidateColor();
  const lista = useMemo(() => {
    const b = stripAccents(busca);
    return [...(q.data?.items ?? [])]
      .filter((i) => !b || stripAccents(i.name).includes(b))
      .sort((a, b2) => (b2.values?.[sq] ?? -1) - (a.values?.[sq] ?? -1));
  }, [q.data, busca, sq]);
  if (q.isLoading) return <Loading linhas={5} />;
  if (q.error) return <ErrorView erro={q.error} onRetry={() => q.refetch()} />;
  if (!lista.length && !busca) return <NoData />;
  const vitorias = q.data?.candidates.find((c) => c.tse_candidate_id === sq)?.wins ?? 0;
  const POR = 15;
  const total = Math.max(1, Math.ceil(lista.length / POR));
  const pagina = Math.min(pag, total);
  const nivelF = asLevel(q.data?.child_level ?? "state");
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm">
          Venceu em <b className="num">{fmtInt(vitorias)}</b> de {fmtInt(q.data?.items.length ?? 0)}{" "}
          {LEVEL_PLURAL_LABELS[nivelF].toLowerCase()}
        </Text>
        <TextInput
          size="xs"
          placeholder="Filtrar…"
          leftSection={<IconSearch size={14} />}
          value={busca}
          onChange={(e) => {
            setBusca(e.currentTarget.value);
            setPag(1);
          }}
          w={180}
        />
      </Group>
      <ScrollArea>
        <Table highlightOnHover verticalSpacing={4} fz="sm" miw={480}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{nivelF === "state" ? "UF" : "Município"}</Table.Th>
              <Table.Th ta="right">% do candidato</Table.Th>
              <Table.Th>Líder</Table.Th>
              <Table.Th ta="right">% apurado</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lista.slice((pagina - 1) * POR, pagina * POR).map((i) => {
              const v = i.values?.[sq];
              const lidera = i.leader?.tse_candidate_id === sq;
              return (
                <Table.Tr
                  key={i.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    useFilter.getState().setRecorte(asLevel(i.level), i.id, i.name);
                    navigate(geoAreaLink(asLevel(i.level), i.id));
                  }}
                >
                  <Table.Td fw={600}>
                    {i.name}
                    {i.level === "municipality" ? (
                      <Text span c="dimmed" size="xs">
                        {" "}
                        · {(i.state_code ?? "").toUpperCase()}
                      </Text>
                    ) : null}
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
                    {i.leader ? (
                      <Group gap={6} wrap="nowrap">
                        <Box
                          w={8}
                          h={8}
                          style={{
                            borderRadius: 8,
                            background: corCand(i.leader.tse_candidate_id, i.leader.color),
                          }}
                        />
                        <Text size="sm" fw={lidera ? 700 : 400}>
                          {i.leader.ballot_name}
                        </Text>
                      </Group>
                    ) : (
                      "—"
                    )}
                  </Table.Td>
                  <Table.Td ta="right" className="num">
                    {fmtPct(i.pct_sections, 1)}
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

export function CandidateScreen({ sq }: { sq: string }) {
  const f = useEffectiveFilter();
  const q = useCandidate(sq, f.turno, f.t);
  const { eFavorito, alternar } = useFavorites();
  const [visao, setVisao] = useState<"uf" | "municipio">("uf");
  const navigate = useNavigate();
  const c = q.data;
  const cargo = c ? c.office_code : f.cargo;
  const uf = c?.state_code ?? null;
  // presidente: mapa por UF e por município; demais: municípios da UF do candidato
  const nivel: Level = uf ? "state" : "country";
  const id = uf ?? "br";
  const todosMun = !uf && visao === "municipio";
  const fav = eFavorito("candidate", sq);
  return (
    <FilterProvider value={{ cargo }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>{c?.ballot_name ?? "Candidato"}</Title>
          <Tooltip label={fav ? "Remover dos favoritos" : "Favoritar candidato"}>
            <ActionIcon
              variant="subtle"
              color="yellow"
              size="lg"
              onClick={() => alternar({ type: "candidate", ref: sq, label: c?.ballot_name ?? sq })}
              aria-label="Favoritar candidato"
            >
              {fav ? <IconStarFilled size={20} /> : <IconStar size={20} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <CandidateCard sqcand={sq} grande link={false} />
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
                  <ElectoralMap
                    tipo="desempenho"
                    nivel={nivel}
                    id={id}
                    todosMunicipios={todosMun}
                    candidatoA={sq}
                    seletorCandidatos={false}
                    cargo={cargo}
                    onSelecionar={(n, i, nome) => {
                      useFilter.getState().setRecorte(n, i, nome);
                      navigate(geoAreaLink(n, i));
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
                <TabelaDesempenho sq={sq} nivel={nivel} id={id} filhos={todosMun ? "municipality" : null} />
              </Card>
            </Grid.Col>
          </Grid>
        )}
        {q.error && <ErrorView erro={q.error} onRetry={() => q.refetch()} />}
      </Stack>
    </FilterProvider>
  );
}
