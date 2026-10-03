import { Box, Group, Paper, ScrollArea, Stack, Text, Tooltip, UnstyledButton, ActionIcon, Collapse } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { COR_STATUS, FAIXAS_MARGEM, ROTULO_STATUS, corSequencial, gradienteCss, corDivergente } from "../../lib/cores";
import { fmtInt, fmtNum } from "../../lib/format";
import type { StatusApuracao } from "../../api/types";
import type { TipoMapa } from "./tipos";

export interface ItemLegenda {
  sqcand: string;
  rotulo: string;
  cor: string;
  vitorias: number;
}

interface Props {
  tipo: TipoMapa;
  candidatos: ItemLegenda[];
  destaque: string | null;
  onDestaque: (sq: string | null) => void;
  unidade: string; // "UFs" | "municípios" | "locais"
  escala?: { min: number; max: number; sufixo: string };
  rotuloA?: string;
  rotuloB?: string;
  corA?: string;
  corB?: string;
  contagemStatus?: Partial<Record<StatusApuracao, number>>;
  vitoriasMunicipios?: Map<string, number> | null;
  partidos?: { sigla: string; cor: string; n: number }[];
}

function Gradiente({ fn, min, max, sufixo, esq, dir }: { fn: (t: number) => [number, number, number]; min: number; max: number; sufixo: string; esq?: string; dir?: string }) {
  return (
    <Stack gap={2}>
      <Box h={10} style={{ borderRadius: 4, background: gradienteCss(fn) }} />
      <Group justify="space-between">
        <Text size="xs" c="dimmed" className="num">
          {esq ?? `${fmtNum(min, 1)}${sufixo}`}
        </Text>
        <Text size="xs" c="dimmed" className="num">
          {dir ?? `${fmtNum(max, 1)}${sufixo}`}
        </Text>
      </Group>
    </Stack>
  );
}

const Hachura = () => (
  <Group gap={6}>
    <Box w={16} h={10} className="hachurado" style={{ borderRadius: 3, border: "1px solid var(--mantine-color-default-border)" }} />
    <Text size="xs" c="dimmed">
      Sem dados
    </Text>
  </Group>
);

export function Legenda(p: Props) {
  const celular = useMediaQuery("(max-width: 48em)");
  const [aberta, { toggle }] = useDisclosure(!celular);
  let corpo: React.ReactNode = null;

  if (p.tipo === "vencedores") {
    corpo = (
      <Stack gap={6}>
        <Text size="xs" c="dimmed">
          Clique em um candidato para destacar onde venceu
        </Text>
        <Stack gap={2}>
          {p.candidatos.slice(0, 12).map((c) => {
            const ativo = p.destaque === c.sqcand;
            const mun = p.vitoriasMunicipios?.get(c.sqcand);
            return (
              <UnstyledButton
                key={c.sqcand}
                onClick={() => p.onDestaque(ativo ? null : c.sqcand)}
                px={6}
                py={3}
                style={{
                  borderRadius: 6,
                  background: ativo ? "var(--mantine-color-default-hover)" : undefined,
                  opacity: p.destaque && !ativo ? 0.55 : 1,
                }}
              >
                <Group gap={8} wrap="nowrap" justify="space-between">
                  <Group gap={6} wrap="nowrap">
                    <Box w={12} h={12} style={{ borderRadius: 3, background: c.cor, flexShrink: 0 }} />
                    <Text size="xs" fw={600} lineClamp={1}>
                      {c.rotulo}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" className="num" style={{ whiteSpace: "nowrap" }}>
                    {fmtInt(c.vitorias)}
                  </Text>
                </Group>
                {ativo && (
                  <Text size="xs" c="dimmed" mt={2}>
                    venceu em {fmtInt(c.vitorias)} {p.unidade}
                    {mun !== undefined && p.unidade === "UFs" ? ` / ${fmtInt(mun)} municípios` : ""}
                  </Text>
                )}
              </UnstyledButton>
            );
          })}
        </Stack>
        <Tooltip label="Opacidade proporcional à margem de vitória do líder">
          <Group gap={3} wrap="nowrap">
            {FAIXAS_MARGEM.map((f) => (
              <Stack key={f.rotulo} gap={0} align="center" style={{ flex: 1 }}>
                <Box h={8} w="100%" style={{ background: `rgba(140,150,175,${f.alpha})`, borderRadius: 2 }} />
                <Text fz={9} c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  {f.rotulo}
                </Text>
              </Stack>
            ))}
          </Group>
        </Tooltip>
      </Stack>
    );
  } else if (p.tipo === "desempenho" || p.tipo === "progresso" || p.tipo === "comparecimento") {
    const e = p.escala ?? { min: 0, max: 100, sufixo: "%" };
    corpo = (
      <Stack gap={6}>
        {p.tipo === "desempenho" && p.rotuloA && (
          <Text size="xs" fw={600}>
            {p.rotuloA} · % dos válidos
          </Text>
        )}
        {p.tipo === "progresso" && <Text size="xs" fw={600}>% das seções totalizadas</Text>}
        {p.tipo === "comparecimento" && <Text size="xs" fw={600}>% de comparecimento</Text>}
        <Gradiente fn={corSequencial} min={e.min} max={e.max} sufixo={e.sufixo} />
        <Hachura />
      </Stack>
    );
  } else if (p.tipo === "comparativo") {
    const e = p.escala ?? { min: -20, max: 20, sufixo: " p.p." };
    corpo = (
      <Stack gap={6}>
        <Text size="xs" fw={600}>
          Diferença em p.p.
        </Text>
        <Gradiente
          fn={(t) => corDivergente(1 - 2 * t, p.corA, p.corB)}
          min={e.min}
          max={e.max}
          sufixo=""
          esq={`${p.rotuloA ?? "A"} +${fmtNum(e.max, 0)}`}
          dir={`${p.rotuloB ?? "B"} +${fmtNum(e.max, 0)}`}
        />
        <Hachura />
      </Stack>
    );
  } else if (p.tipo === "locais") {
    corpo = (
      <Stack gap={4}>
        <Text size="xs" fw={600}>
          Locais de votação
        </Text>
        {(["nao_recebido", "parcial", "apurado"] as StatusApuracao[]).map((s) => (
          <Group key={s} gap={6} justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              <Box w={10} h={10} style={{ borderRadius: 99, background: COR_STATUS[s] }} />
              <Text size="xs">{ROTULO_STATUS[s]}</Text>
            </Group>
            {p.contagemStatus && (
              <Text size="xs" c="dimmed" className="num">
                {fmtInt(p.contagemStatus[s] ?? 0)}
              </Text>
            )}
          </Group>
        ))}
        <Text fz={10} c="dimmed">
          Em zoom baixo: hexágonos com a % de locais apurados
        </Text>
      </Stack>
    );
  } else if (p.tipo === "partido") {
    corpo = (
      <Stack gap={2}>
        <Text size="xs" fw={600}>
          Partido mais votado
        </Text>
        {(p.partidos ?? []).slice(0, 12).map((x) => (
          <Group key={x.sigla} gap={6} justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              <Box w={12} h={12} style={{ borderRadius: 3, background: x.cor }} />
              <Text size="xs" fw={600}>
                {x.sigla}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" className="num">
              {fmtInt(x.n)} {p.unidade}
            </Text>
          </Group>
        ))}
      </Stack>
    );
  }

  if (!corpo) return null;
  return (
    <Paper
      withBorder
      shadow="md"
      p="xs"
      radius="md"
      style={{ position: "absolute", left: 8, bottom: 8, zIndex: 5, width: 230, maxWidth: "calc(100% - 16px)", backdropFilter: "blur(6px)" }}
    >
      <Group justify="space-between" gap={4} mb={aberta ? 4 : 0}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Legenda
        </Text>
        <ActionIcon size="xs" variant="subtle" onClick={toggle} aria-label={aberta ? "Recolher legenda" : "Expandir legenda"}>
          {aberta ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
        </ActionIcon>
      </Group>
      <Collapse in={aberta}>
        <ScrollArea.Autosize mah={260} className="scroll-fino">
          {corpo}
        </ScrollArea.Autosize>
      </Collapse>
    </Paper>
  );
}
