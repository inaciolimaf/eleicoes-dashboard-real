import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { useCandidate } from "../hooks";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { useCandidateColor } from "../../../lib/useColor";
import { STATE_BY_CODE } from "../../../lib/geo-areas";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { Num } from "../../../components/Num";
import { CandidateAvatar } from "./CandidateAvatar";
import { StatusBadge } from "./StatusBadge";
import { rgba } from "../../../lib/palettes";
import type { CandidateStatus } from "../../../api/models";

export function CandidateCard({
  sqcand,
  grande,
  link = true,
}: {
  sqcand: string | null | undefined;
  grande?: boolean;
  link?: boolean;
}) {
  const f = useEffectiveFilter();
  const q = useCandidate(sqcand, f.turno, f.t);
  const corCand = useCandidateColor();
  if (!sqcand)
    return <NoData titulo="Escolha um candidato">Configure o widget para escolher o candidato.</NoData>;
  if (q.isLoading) return <Loading linhas={2} />;
  if (q.error) return <ErrorView erro={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  if (!c) return <NoData />;
  const cor = corCand(c.tse_candidate_id, c.color, c.ballot_number);
  const onde = c.state_code ? `em ${c.state_code.toUpperCase()}` : "no Brasil";
  return (
    <Paper
      p={grande ? "lg" : "sm"}
      radius="lg"
      style={{
        background: `linear-gradient(135deg, ${rgba(cor, 0.22)}, transparent 65%)`,
        border: `1px solid ${rgba(cor, 0.35)}`,
      }}
    >
      <Group gap="md" wrap="nowrap" align="flex-start">
        <CandidateAvatar fotoUrl={c.photo_url} nome={c.ballot_name} cor={cor} size={grande ? 96 : 64} />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="wrap">
            <Badge
              size={grande ? "lg" : "md"}
              color={cor}
              variant="filled"
              className="num"
              styles={{ root: { color: "#fff" } }}
            >
              {c.ballot_number}
            </Badge>
            {link ? (
              <Text
                fw={800}
                size={grande ? "xl" : "md"}
                lineClamp={1}
                component={Link}
                to={`/candidatos/${c.tse_candidate_id}`}
                c="inherit"
              >
                {c.ballot_name}
              </Text>
            ) : (
              <Text fw={800} size={grande ? "xl" : "md"} lineClamp={1}>
                {c.ballot_name}
              </Text>
            )}
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {c.name}
          </Text>
          <Text size="sm">
            {c.party_abbreviation}
            {c.alliance && c.alliance !== c.party_abbreviation ? ` · ${c.alliance}` : ""} ·{" "}
            {c.office_code ? "" : ""}
            {c.state_code ? ` · ${STATE_BY_CODE[c.state_code]?.nome ?? c.state_code.toUpperCase()}` : ""}
          </Text>
          {c.vice_and_substitutes?.length > 0 && (
            <Text size="xs" c="dimmed">
              {c.vice_and_substitutes
                .map(
                  (v) =>
                    `${v.kind === "vice" ? "Vice" : (v.kind ?? "").charAt(0).toUpperCase() + (v.kind ?? "").slice(1)}: ${v.name}`,
                )
                .join(" · ")}
            </Text>
          )}
          {c.result ? (
            <Group gap="lg" mt={4} align="flex-end">
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  % válidos
                </Text>
                <Num
                  valor={c.result.valid_pct}
                  tipo="pct"
                  style={{ fontSize: grande ? "2rem" : "1.4rem", fontWeight: 800 }}
                />
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Votos
                </Text>
                <Num
                  valor={c.result.votes}
                  style={{ fontSize: grande ? "1.3rem" : "1rem", fontWeight: 600 }}
                />
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Posição
                </Text>
                <Text fw={700} className="num">
                  {c.result.position}º
                </Text>
              </Stack>
              <StatusBadge situacao={c.result.status as CandidateStatus} ondeGeral={onde} />
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Sem votos apurados ainda.
            </Text>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}
