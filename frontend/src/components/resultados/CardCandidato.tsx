import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { useCandidato } from "../../api/hooks";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { useCorCandidato } from "../../lib/useCor";
import { UF_POR_SIGLA } from "../../lib/recortes";
import { Carregando, ErroView, SemDados } from "../common/Estados";
import { Num } from "../common/Num";
import { AvatarCandidato } from "./AvatarCandidato";
import { SeloSituacao } from "./SeloSituacao";
import { rgba } from "../../lib/cores";

export function CardCandidato({ sqcand, grande, link = true }: { sqcand: string | null | undefined; grande?: boolean; link?: boolean }) {
  const f = useFiltroEfetivo();
  const q = useCandidato(sqcand, f.turno, f.t);
  const corCand = useCorCandidato();
  if (!sqcand) return <SemDados titulo="Escolha um candidato">Configure o widget para escolher o candidato.</SemDados>;
  if (q.isLoading) return <Carregando linhas={2} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  if (!c) return <SemDados />;
  const cor = corCand(c.sqcand, c.cor, c.numero);
  const onde = c.uf ? `em ${c.uf.toUpperCase()}` : "no Brasil";
  return (
    <Paper
      p={grande ? "lg" : "sm"}
      radius="lg"
      style={{ background: `linear-gradient(135deg, ${rgba(cor, 0.22)}, transparent 65%)`, border: `1px solid ${rgba(cor, 0.35)}` }}
    >
      <Group gap="md" wrap="nowrap" align="flex-start">
        <AvatarCandidato fotoUrl={c.foto_url} nome={c.nome_urna} cor={cor} size={grande ? 96 : 64} />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="wrap">
            <Badge size={grande ? "lg" : "md"} color={cor} variant="filled" className="num" styles={{ root: { color: "#fff" } }}>
              {c.numero}
            </Badge>
            {link ? (
              <Text fw={800} size={grande ? "xl" : "md"} lineClamp={1} component={Link} to={`/candidatos/${c.sqcand}`} c="inherit">
                {c.nome_urna}
              </Text>
            ) : (
              <Text fw={800} size={grande ? "xl" : "md"} lineClamp={1}>
                {c.nome_urna}
              </Text>
            )}
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {c.nome}
          </Text>
          <Text size="sm">
            {c.partido_sigla}
            {c.agremiacao && c.agremiacao !== c.partido_sigla ? ` · ${c.agremiacao}` : ""} · {"nome" in c.cargo ? c.cargo.nome : ""}
            {c.uf ? ` · ${UF_POR_SIGLA[c.uf]?.nome ?? c.uf.toUpperCase()}` : ""}
          </Text>
          {c.vices?.length > 0 && (
            <Text size="xs" c="dimmed">
              {c.vices.map((v) => `${v.tipo === "vice" ? "Vice" : v.tipo.charAt(0).toUpperCase() + v.tipo.slice(1)}: ${v.nome}`).join(" · ")}
            </Text>
          )}
          {c.resultado ? (
            <Group gap="lg" mt={4} align="flex-end">
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  % válidos
                </Text>
                <Num valor={c.resultado.pct_validos} tipo="pct" style={{ fontSize: grande ? "2rem" : "1.4rem", fontWeight: 800 }} />
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Votos
                </Text>
                <Num valor={c.resultado.votos} style={{ fontSize: grande ? "1.3rem" : "1rem", fontWeight: 600 }} />
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Posição
                </Text>
                <Text fw={700} className="num">
                  {c.resultado.posicao}º
                </Text>
              </Stack>
              <SeloSituacao situacao={c.resultado.situacao} ondeGeral={onde} />
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
