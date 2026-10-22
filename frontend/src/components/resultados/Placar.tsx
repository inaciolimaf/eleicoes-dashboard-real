import {
  Badge,
  Box,
  Group,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconArrowsDiff, IconChartDonut, IconUsers } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CandidateResultDto, ResultsWithDataDto } from "../../api/models";
import { fmtInt, fmtPP, fmtPct } from "../../lib/format";
import { useCorCandidato } from "../../lib/useCor";
import { usePrefs } from "../../store/prefs";
import { Num, useFlash } from "../common/Num";
import { AvatarCandidato } from "./AvatarCandidato";
import { SeloSituacao } from "./SeloSituacao";
import { Hemiciclo } from "../graficos/Hemiciclo";
import { UF_POR_SIGLA } from "../../lib/recortes";
import type { CandidateStatus } from "../../api/models";

export interface PlacarOpcoes {
  topN?: number;
  soEleitos?: boolean;
  mostrarFotos?: boolean;
  aba?: "candidatos" | "partidos";
  /** chamado ao clicar no nome do candidato; padrão: navega para a página do candidato */
  linkCandidato?: boolean;
}

function ondeGeral(res: ResultsWithDataDto): string {
  if (Number(res.office.office_code) === 1) return "no Brasil";
  const uf = res.geo_area.state_code ?? res.geo_area.breadcrumb.find((b) => b.level === "state")?.id;
  return uf ? `em ${uf.toUpperCase()}` : "na UF";
}

function LinhaCandidato({
  c,
  maxPct,
  res,
  mostrarFotos,
  link,
}: {
  c: CandidateResultDto;
  maxPct: number;
  res: ResultsWithDataDto;
  mostrarFotos: boolean;
  link: boolean;
}) {
  const cor = useCorCandidato()(c.tse_candidate_id, c.color, c.ballot_number);
  const flash = useFlash(c.votes);
  const largura = maxPct > 0 ? Math.max(0.5, (c.valid_pct / Math.max(maxPct, 1)) * 100) : 0;
  const majoritario = res.office.voting_system === "majoritario";
  const nome = (
    <Text fw={700} size="sm" lineClamp={1} style={{ minWidth: 0 }}>
      {c.ballot_name}
    </Text>
  );
  return (
    <Box py={6} px={4} className={flash ? "glow" : undefined}>
      <Group gap="sm" wrap="nowrap" align="center">
        {mostrarFotos && <AvatarCandidato fotoUrl={c.photo_url} nome={c.ballot_name} cor={cor} size={40} />}
        <Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap" justify="space-between" align="flex-start">
            <Group gap={6} wrap="wrap" style={{ minWidth: 0, flex: 1, rowGap: 2 }}>
              <Badge
                variant="filled"
                size="sm"
                radius="sm"
                color={cor}
                className="num"
                styles={{ root: { flexShrink: 0, color: "#fff" } }}
              >
                {c.ballot_number}
              </Badge>
              {link ? (
                <UnstyledButton
                  component={Link}
                  to={`/candidatos/${c.tse_candidate_id}`}
                  style={{ minWidth: 0 }}
                >
                  {nome}
                </UnstyledButton>
              ) : (
                nome
              )}
              <SeloSituacao
                situacao={c.status as CandidateStatus}
                situacaoGeral={c.overall_status as CandidateStatus}
                ondeGeral={ondeGeral(res)}
                totalizadoEm={res.tallied_at}
                size="xs"
              />
            </Group>
            <Num
              valor={c.valid_pct}
              tipo="pct"
              style={{ fontWeight: 800, fontSize: "1.05rem" }}
              brilho={false}
            />
          </Group>
          <Group gap={8} wrap="nowrap">
            <Box className="barra-trilho" style={{ flex: 1 }}>
              <Box className="barra-preenchida" style={{ width: `${largura}%`, background: cor }} />
              {majoritario &&
                maxPct > 0 &&
                maxPct <= 100 &&
                (Number(res.office.office_code) === 1 || Number(res.office.office_code) === 3) && (
                  <Tooltip label="50% dos válidos">
                    <Box
                      className="barra-50"
                      style={{
                        left: `${(50 / Math.max(maxPct, 1)) * 100}%`,
                        display: maxPct >= 50 ? "block" : "none",
                      }}
                    />
                  </Tooltip>
                )}
            </Box>
            <Num
              valor={c.votes}
              style={{ fontSize: "0.8rem", minWidth: 90, textAlign: "right" }}
              brilho={false}
            />
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {c.party_abbreviation}
            {c.alliance && c.alliance !== c.party_abbreviation ? ` · ${c.alliance}` : ""}
            {c.vice_and_substitutes?.length
              ? ` · ${c.vice_and_substitutes.map((v) => `${v.kind === "vice" ? "Vice" : v.kind}: ${v.name}`).join(", ")}`
              : ""}
            {c.vote_destination && c.vote_destination !== "Válido" ? ` · ${c.vote_destination}` : ""}
          </Text>
        </Stack>
      </Group>
    </Box>
  );
}

function Diferenca({ res, lista }: { res: ResultsWithDataDto; lista: CandidateResultDto[] }) {
  if (res.office.voting_system !== "majoritario" || lista.length < 2) return null;
  const [a, b] = lista;
  const pp = res.leader?.margin_pp ?? a.valid_pct - b.valid_pct;
  const votos = res.leader?.margin_votes ?? a.votes - b.votes;
  const vagas = res.office.seats ?? 1;
  const cd = Number(res.office.office_code);
  const terceiro = vagas >= 2 && lista.length >= 3 ? lista[2] : null;
  const falta50 = (cd === 1 || cd === 3) && a.valid_pct < 50 ? 50 - a.valid_pct : null;
  return (
    <Stack gap={2} mt={4}>
      <Group gap={6}>
        <IconArrowsDiff size={14} color="var(--mantine-color-dimmed)" />
        <Text size="xs" c="dimmed">
          Diferença 1º × 2º: <b className="num">{fmtPP(pp)}</b> (<span className="num">{fmtInt(votos)}</span>{" "}
          votos)
        </Text>
      </Group>
      {terceiro && (
        <Text size="xs" c="dimmed" pl={20}>
          Diferença 2º × 3º (última vaga):{" "}
          <b className="num">{fmtPP(lista[1].valid_pct - terceiro.valid_pct)}</b> (
          <span className="num">{fmtInt(lista[1].votes - terceiro.votes)}</span> votos)
        </Text>
      )}
      {falta50 !== null && (
        <Text size="xs" c="dimmed" pl={20}>
          Líder precisa de mais <b className="num">{fmtPP(falta50)}</b> para 50% + 1 dos válidos
        </Text>
      )}
    </Stack>
  );
}

function TabelaPartidos({ res }: { res: ResultsWithDataDto }) {
  const ag = [...res.alliances].sort((a, b) => (b.seats ?? 0) - (a.seats ?? 0) || b.votes - a.votes);
  const totalVotos = ag.reduce((s, a) => s + a.votes, 0);
  return (
    <Table striped highlightOnHover verticalSpacing={4} fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Partido / Federação</Table.Th>
          <Table.Th ta="right">Votos</Table.Th>
          <Table.Th ta="right">%</Table.Th>
          <Table.Th ta="right">Vagas</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {ag.map((a) => (
          <Table.Tr key={a.name}>
            <Table.Td>
              <Group gap={6} wrap="nowrap">
                <Box w={10} h={10} style={{ borderRadius: 3, background: a.color, flexShrink: 0 }} />
                <Stack gap={0}>
                  <Text size="sm" fw={600} lineClamp={1}>
                    {a.name}
                  </Text>
                  {a.parties.length > 1 && (
                    <Text size="xs" c="dimmed">
                      {a.parties.join(" · ")}
                    </Text>
                  )}
                </Stack>
              </Group>
            </Table.Td>
            <Table.Td ta="right" className="num">
              {fmtInt(a.votes)}
            </Table.Td>
            <Table.Td ta="right" className="num">
              {fmtPct(totalVotos ? (a.votes / totalVotos) * 100 : null)}
            </Table.Td>
            <Table.Td ta="right">
              <Num valor={a.seats} style={{ fontWeight: 700 }} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Placar (ranking) de candidatos com selos de situação, animado. */
export function Placar({ res, opcoes = {} }: { res: ResultsWithDataDto; opcoes?: PlacarOpcoes }) {
  const animacoes = usePrefs((s) => s.animacoes);
  const [soEleitos, setSoEleitos] = useState(!!opcoes.soEleitos);
  const proporcional = res.office.voting_system === "proporcional";
  const [aba, setAba] = useState<string | null>(opcoes.aba ?? "candidatos");
  const mostrarFotos = opcoes.mostrarFotos ?? true;

  const ordenados = useMemo(
    () => [...res.candidates].sort((a, b) => b.votes - a.votes || a.position - b.position),
    [res.candidates],
  );
  const filtrados = useMemo(() => {
    let l = ordenados;
    if (soEleitos) l = l.filter((c) => c.elected || c.status === "ELECTED" || c.overall_status === "ELECTED");
    if (opcoes.topN && opcoes.topN > 0) l = l.slice(0, opcoes.topN);
    return l;
  }, [ordenados, soEleitos, opcoes.topN]);
  const maxPct = ordenados[0]?.valid_pct ?? 0;

  const lista = (
    <Stack gap={0}>
      <AnimatePresence initial={false}>
        {filtrados.map((c) => (
          <motion.div
            key={c.tse_candidate_id}
            layout={animacoes ? "position" : false}
            initial={animacoes ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animacoes ? { opacity: 0 } : undefined}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
          >
            <LinhaCandidato
              c={c}
              maxPct={maxPct}
              res={res}
              mostrarFotos={mostrarFotos}
              link={opcoes.linkCandidato ?? true}
            />
          </motion.div>
        ))}
      </AnimatePresence>
      {filtrados.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="md">
          {soEleitos ? "Nenhum eleito definido ainda." : "Nenhum candidato."}
        </Text>
      )}
    </Stack>
  );

  const toggle = (
    <Switch
      size="xs"
      label="Só eleitos"
      checked={soEleitos}
      onChange={(e) => setSoEleitos(e.currentTarget.checked)}
    />
  );

  if (!proporcional) {
    return (
      <Stack gap={4}>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {res.candidates.length} candidato(s) ·{" "}
            {res.office.seats && res.office.seats > 1 ? `${res.office.seats} vagas` : "1 vaga"}
            {res.geo_area.state_code && Number(res.office.office_code) !== 1
              ? ` · ${UF_POR_SIGLA[res.geo_area.state_code]?.nome ?? res.geo_area.state_code.toUpperCase()}`
              : ""}
          </Text>
          {toggle}
        </Group>
        {lista}
        <Diferenca res={res} lista={ordenados} />
      </Stack>
    );
  }

  return (
    <Tabs value={aba} onChange={setAba} variant="pills" radius="md">
      <Group justify="space-between" mb={6}>
        <Tabs.List>
          <Tabs.Tab value="candidatos" leftSection={<IconUsers size={14} />}>
            Candidatos
          </Tabs.Tab>
          <Tabs.Tab value="partidos" leftSection={<IconChartDonut size={14} />}>
            Partidos/Federações
          </Tabs.Tab>
        </Tabs.List>
        {aba === "candidatos" && toggle}
      </Group>
      <Tabs.Panel value="candidatos">{lista}</Tabs.Panel>
      <Tabs.Panel value="partidos">
        {res.alliances.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            Distribuição de vagas ainda não publicada.
          </Text>
        ) : (
          <Stack gap="xs">
            <Hemiciclo agremiacoes={res.alliances} height={220} />
            <ScrollArea.Autosize mah={320} className="scroll-fino">
              <TabelaPartidos res={res} />
            </ScrollArea.Autosize>
          </Stack>
        )}
      </Tabs.Panel>
    </Tabs>
  );
}
