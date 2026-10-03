import { Badge, Card, Group, Select, SimpleGrid, Stack, Text, TextInput, Title, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCandidatos, useEleicoes } from "../api/hooks";
import { AvatarCandidato } from "../components/resultados/AvatarCandidato";
import { Carregando, ErroView, SemDados } from "../components/common/Estados";
import { abrangenciaPadrao, infoCargo, NOME_CARGO } from "../lib/cargos";
import { UFS, ufDoId } from "../lib/recortes";
import { semAcento } from "../lib/format";
import { useCorCandidato } from "../lib/useCor";
import { useFiltro } from "../store/filtro";

export default function CandidatosPage() {
  const f = useFiltro();
  const el = useEleicoes();
  const abr = infoCargo(el.data, f.cargo)?.abrangencia ?? abrangenciaPadrao(f.cargo);
  const [uf, setUf] = useState<string | null>(ufDoId(f.nivel, f.id) ?? (f.cargo === 8 ? "df" : "sp"));
  const [busca, setBusca] = useState("");
  const [partido, setPartido] = useState<string | null>(null);
  const q = useCandidatos(f.turno, f.cargo, abr === "uf" ? uf : null, abr !== "uf" || !!uf);
  const corCand = useCorCandidato();
  const partidos = useMemo(() => [...new Set((q.data ?? []).map((c) => c.partido_sigla))].sort(), [q.data]);
  const lista = useMemo(() => {
    const b = semAcento(busca.trim());
    return (q.data ?? [])
      .filter((c) => !partido || c.partido_sigla === partido)
      .filter((c) => !b || semAcento(`${c.nome_urna} ${c.nome} ${c.numero} ${c.partido_sigla}`).includes(b))
      .sort((a, b2) => a.numero - b2.numero);
  }, [q.data, busca, partido]);
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Candidatos · {f.turno}º turno
          </Text>
          <Title order={2}>{NOME_CARGO[f.cargo] ?? "Candidatos"}</Title>
        </Stack>
        <Group gap="xs">
          {abr === "uf" && (
            <Select
              w={190}
              data={UFS.map((u) => ({ value: u.uf, label: `${u.uf.toUpperCase()} · ${u.nome}` }))}
              value={uf}
              onChange={setUf}
              searchable
              aria-label="UF"
            />
          )}
          <Select w={130} data={partidos} value={partido} onChange={setPartido} placeholder="Partido" clearable searchable />
          <TextInput w={220} placeholder="Nome ou número…" leftSection={<IconSearch size={14} />} value={busca} onChange={(e) => setBusca(e.currentTarget.value)} />
        </Group>
      </Group>
      {q.isLoading ? (
        <Carregando linhas={6} />
      ) : q.error ? (
        <ErroView erro={q.error} onRetry={() => q.refetch()} />
      ) : !lista.length ? (
        <SemDados titulo="Nenhum candidato encontrado" />
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 4 }} spacing="sm">
          {lista.slice(0, 600).map((c) => {
            const cor = corCand(c.sqcand, c.cor, c.numero);
            return (
              <UnstyledButton key={c.sqcand} component={Link} to={`/candidatos/${c.sqcand}`}>
                <Card p="sm" h="100%" className="clicavel">
                  <Group wrap="nowrap" gap="sm">
                    <AvatarCandidato fotoUrl={c.foto_url} nome={c.nome_urna} cor={cor} size={48} />
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Group gap={6} wrap="nowrap">
                        <Badge color={cor} variant="filled" className="num" styles={{ root: { color: "#fff" } }}>
                          {c.numero}
                        </Badge>
                        <Text fw={700} lineClamp={1}>
                          {c.nome_urna}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {c.partido_sigla}
                        {c.agremiacao && c.agremiacao !== c.partido_sigla ? ` · ${c.agremiacao}` : ""}
                        {c.uf ? ` · ${c.uf.toUpperCase()}` : ""}
                      </Text>
                    </Stack>
                  </Group>
                </Card>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      )}
      {lista.length > 600 && (
        <Text size="sm" c="dimmed" ta="center">
          Mostrando 600 de {lista.length}. Refine a busca.
        </Text>
      )}
    </Stack>
  );
}
