import {
  Badge,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCandidates, useElections } from "../hooks";
import { CandidateAvatar } from "./CandidateAvatar";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { defaultScope, officeInfo, OFFICE_NAME } from "../../../lib/offices";
import { UFS, stateOfId } from "../../../lib/geo-areas";
import { stripAccents } from "../../../lib/formatting";
import { useCandidateColor } from "../../../lib/useColor";
import { useFilter } from "../../../lib/filter-store";

export function CandidatesScreen() {
  const f = useFilter();
  const el = useElections();
  const abr = officeInfo(el.data, f.cargo)?.coverage ?? defaultScope(f.cargo);
  const [uf, setUf] = useState<string | null>(stateOfId(f.nivel, f.id) ?? (f.cargo === 8 ? "df" : "sp"));
  const [busca, setBusca] = useState("");
  const [partido, setPartido] = useState<string | null>(null);
  const q = useCandidates(f.turno, f.cargo, abr === "uf" ? uf : null, abr !== "uf" || !!uf);
  const corCand = useCandidateColor();
  const partidos = useMemo(
    () => [...new Set((q.data ?? []).map((c) => c.party_abbreviation))].sort(),
    [q.data],
  );
  const lista = useMemo(() => {
    const b = stripAccents(busca.trim());
    return (q.data ?? [])
      .filter((c) => !partido || c.party_abbreviation === partido)
      .filter(
        (c) =>
          !b ||
          stripAccents(`${c.ballot_name} ${c.name} ${c.ballot_number} ${c.party_abbreviation}`).includes(b),
      )
      .sort((a, b2) => (a.ballot_number ?? 0) - (b2.ballot_number ?? 0));
  }, [q.data, busca, partido]);
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Candidatos · {f.turno}º turno
          </Text>
          <Title order={2}>{OFFICE_NAME[f.cargo] ?? "Candidatos"}</Title>
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
          <Select
            w={130}
            data={partidos}
            value={partido}
            onChange={setPartido}
            placeholder="Partido"
            clearable
            searchable
          />
          <TextInput
            w={220}
            placeholder="Nome ou número…"
            leftSection={<IconSearch size={14} />}
            value={busca}
            onChange={(e) => setBusca(e.currentTarget.value)}
          />
        </Group>
      </Group>
      {q.isLoading ? (
        <Loading linhas={6} />
      ) : q.error ? (
        <ErrorView erro={q.error} onRetry={() => q.refetch()} />
      ) : !lista.length ? (
        <NoData titulo="Nenhum candidato encontrado" />
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 4 }} spacing="sm">
          {lista.slice(0, 600).map((c) => {
            const cor = corCand(c.tse_candidate_id, c.color, c.ballot_number);
            return (
              <UnstyledButton
                key={c.tse_candidate_id}
                component={Link}
                to={`/candidatos/${c.tse_candidate_id}`}
              >
                <Card p="sm" h="100%" className="clicavel">
                  <Group wrap="nowrap" gap="sm">
                    <CandidateAvatar fotoUrl={c.photo_url} nome={c.ballot_name} cor={cor} size={48} />
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Group gap={6} wrap="nowrap">
                        <Badge
                          color={cor}
                          variant="filled"
                          className="num"
                          styles={{ root: { color: "#fff" } }}
                        >
                          {c.ballot_number}
                        </Badge>
                        <Text fw={700} lineClamp={1}>
                          {c.ballot_name}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {c.party_abbreviation}
                        {c.alliance && c.alliance !== c.party_abbreviation ? ` · ${c.alliance}` : ""}
                        {c.state_code ? ` · ${c.state_code.toUpperCase()}` : ""}
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
