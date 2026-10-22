import { Alert, Box, Group, Progress, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconInfoCircle } from "@tabler/icons-react";
import type { ResultsWithDataDto } from "../../api/models";
import { Num } from "../common/Num";
import { fmtInt, fmtPct } from "../../lib/format";
import { FonteDados } from "./FonteDados";

function Stat({
  rotulo,
  valor,
  pct,
  dica,
}: {
  rotulo: string;
  valor: number;
  pct?: number | null;
  dica?: string;
}) {
  return (
    <Tooltip label={dica} disabled={!dica}>
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
          {rotulo}
        </Text>
        <Num valor={valor} style={{ fontSize: "1.05rem", fontWeight: 600 }} />
        {pct !== undefined && pct !== null && (
          <Text size="xs" c="dimmed">
            <Num valor={pct} tipo="pct" brilho={false} />
          </Text>
        )}
      </Stack>
    </Tooltip>
  );
}

/** Bloco de totais (RF-03): votos válidos em destaque. */
export function BlocoTotais({ res, compacto }: { res: ResultsWithDataDto; compacto?: boolean }) {
  const { ref, width } = useElementSize();
  const t = res.totals;
  const cols = width > 640 ? 6 : width > 420 ? 3 : 2;
  const pctEleitoradoApurado = t.electorate ? (t.tallied_electorate / t.electorate) * 100 : null;
  return (
    <Stack gap="sm" ref={ref}>
      <Box>
        <Group justify="space-between" gap={4} mb={4} wrap="nowrap">
          <Text size="sm" fw={600}>
            <Num valor={t.pct_sections} tipo="pct" />{" "}
            <Text span size="sm" c="dimmed" fw={400}>
              das seções totalizadas
            </Text>
          </Text>
          <Text size="xs" c="dimmed" className="num" visibleFrom="xs">
            {fmtInt(t.sections_tallied)} de {fmtInt(t.sections_total)}
          </Text>
        </Group>
        <Progress
          value={t.pct_sections}
          size="md"
          radius="xl"
          color={t.pct_sections >= 100 ? "green" : "eleicao"}
          striped={!res.final_tally && t.pct_sections < 100}
          animated={!res.final_tally && t.pct_sections < 100}
          aria-label="Percentual de seções totalizadas"
        />
      </Box>

      <Group align="flex-end" justify="space-between" gap="xs">
        <Stack gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.6 }}>
            Votos válidos
          </Text>
          <Num
            valor={t.valid_votes}
            style={{ fontSize: compacto ? "1.6rem" : "2.3rem", fontWeight: 800, lineHeight: 1.1 }}
          />
          <Text size="sm" c="dimmed">
            <Num valor={t.pct_valid} tipo="pct" brilho={false} /> do comparecimento
          </Text>
        </Stack>
        {res.mathematically_decided && !res.final_tally && (
          <Text size="xs" c="teal.4" fw={600}>
            Matematicamente definido
          </Text>
        )}
        {res.final_tally && (
          <Text size="xs" c="green.5" fw={700}>
            Totalização final
          </Text>
        )}
      </Group>

      {!compacto && (
        <SimpleGrid cols={cols} spacing="sm" verticalSpacing="xs">
          <Stat rotulo="Brancos" valor={t.blank_votes} pct={t.pct_blank} dica="% sobre o total de votos" />
          <Stat rotulo="Nulos" valor={t.null_votes} pct={t.pct_null} dica="% sobre o total de votos" />
          <Stat
            rotulo="Abstenção"
            valor={t.abstention}
            pct={t.pct_abstention}
            dica="% sobre o eleitorado apurado"
          />
          <Stat
            rotulo="Comparecimento"
            valor={t.turnout}
            pct={t.pct_turnout}
            dica="% sobre o eleitorado apurado"
          />
          <Stat rotulo="Votos totais" valor={t.total_votes} />
          <Stat
            rotulo="Eleitorado"
            valor={t.electorate}
            pct={pctEleitoradoApurado}
            dica={`Eleitorado apurado: ${fmtInt(t.tallied_electorate)} (${fmtPct(pctEleitoradoApurado)})`}
          />
        </SimpleGrid>
      )}
      {compacto && (
        <Group gap="md">
          <Text size="xs" c="dimmed">
            Brancos <b className="num">{fmtPct(t.pct_blank)}</b>
          </Text>
          <Text size="xs" c="dimmed">
            Nulos <b className="num">{fmtPct(t.pct_null)}</b>
          </Text>
          <Text size="xs" c="dimmed">
            Abstenção <b className="num">{fmtPct(t.pct_abstention)}</b>
          </Text>
        </Group>
      )}

      {res.coverage && (
        <Alert
          variant="light"
          color={res.coverage.collected_sections < res.coverage.total_sections ? "yellow" : "teal"}
          p="xs"
          icon={<IconInfoCircle size={16} />}
        >
          <Text size="sm">
            <b className="num">{fmtInt(res.coverage.collected_sections)}</b> de{" "}
            <b className="num">{fmtInt(res.coverage.total_sections)}</b> seções deste recorte coletadas (soma
            dos boletins de urna).
          </Text>
        </Alert>
      )}
      <Group justify="flex-end">
        <FonteDados res={res} />
      </Group>
    </Stack>
  );
}
