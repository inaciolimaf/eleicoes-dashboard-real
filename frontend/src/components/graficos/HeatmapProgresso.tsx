import { Box, Group, Paper, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useProgresso } from "../../api/hooks";
import type { ProgressoItem } from "../../api/types";
import { useFiltroEfetivo } from "../../lib/filtro-efetivo";
import { corSequencial, gradienteCss } from "../../lib/cores";
import { fmtInt, fmtPct } from "../../lib/format";
import { fmtHora } from "../../lib/time";
import { useLive } from "../../realtime/useLive";
import { topico } from "../../realtime/topicos";
import { Carregando, ErroView, SemDados } from "../common/Estados";
import { useFlash } from "../common/Num";

/** Cartograma em grade das UFs (col, linha) */
const GRADE: Record<string, [number, number]> = {
  rr: [2, 0], ap: [4, 0],
  am: [1, 1], pa: [3, 1], ma: [4, 1], ce: [5, 1], rn: [6, 1],
  ac: [0, 2], ro: [1, 2], mt: [2, 2], to: [3, 2], pi: [4, 2], pe: [5, 2], pb: [6, 2],
  ms: [2, 3], go: [3, 3], df: [4, 3], ba: [5, 3], al: [6, 3],
  sp: [3, 4], mg: [4, 4], es: [5, 4], se: [6, 4],
  pr: [3, 5], rj: [4, 5],
  sc: [3, 6],
  rs: [3, 7],
};

function Tile({ it, metrica, onClick }: { it: ProgressoItem; metrica: "pct_secoes" | "pct_comparecimento"; onClick?: () => void }) {
  const v = metrica === "pct_secoes" ? it.pct_secoes : it.pct_comparecimento;
  const t = metrica === "pct_secoes" ? v / 100 : (v - 60) / 35;
  const [r, g, b] = corSequencial(t);
  const claro = r * 0.299 + g * 0.587 + b * 0.114 > 150;
  const flash = useFlash(it.pct_secoes);
  return (
    <Tooltip
      label={
        <Stack gap={0}>
          <b>{it.nome}</b>
          <span>
            {fmtPct(it.pct_secoes)} das seções ({fmtInt(it.secoes_totalizadas)} de {fmtInt(it.secoes_total)})
          </span>
          <span>
            Municípios: {it.municipios_finalizados} finalizados · {it.municipios_parciais} parciais · {it.municipios_nao_recebidos} sem dados
          </span>
          <span>Comparecimento: {fmtPct(it.pct_comparecimento)}</span>
          <span>Atualizado às {fmtHora(it.atualizado_em)}</span>
        </Stack>
      }
    >
      <UnstyledButton
        onClick={onClick}
        className={flash ? "glow" : undefined}
        style={{
          gridColumn: (GRADE[it.uf]?.[0] ?? 0) + 1,
          gridRow: (GRADE[it.uf]?.[1] ?? 0) + 1,
          background: `rgb(${r},${g},${b})`,
          color: claro ? "#0B1220" : "#fff",
          borderRadius: 8,
          aspectRatio: "1 / 1",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
          transition: "background 500ms ease",
        }}
        aria-label={`${it.nome}: ${fmtPct(v)}`}
      >
        <Text fw={800} fz="clamp(9px, 1.2vw, 14px)" lh={1}>
          {it.uf.toUpperCase()}
        </Text>
        <Text fz="clamp(8px, 0.9vw, 11px)" className="num" lh={1.2}>
          {fmtPct(v, 1).replace("%", "")}
        </Text>
      </UnstyledButton>
    </Tooltip>
  );
}

export function HeatmapProgresso({
  metrica = "pct_secoes",
  onSelecionarUf,
  modo = "grade",
}: {
  metrica?: "pct_secoes" | "pct_comparecimento";
  onSelecionarUf?: (uf: string, nome: string) => void;
  modo?: "grade" | "lista";
}) {
  const f = useFiltroEfetivo();
  const q = useProgresso(f.turno, f.t);
  useLive([topico.progresso(f.turno)]);
  if (q.isLoading) return <Carregando altura={240} />;
  if (q.error) return <ErroView erro={q.error} onRetry={() => q.refetch()} />;
  if (!q.data || !q.data.itens.length) return <SemDados />;
  const itens = q.data.itens.filter((i) => i.uf !== "zz" || modo === "lista");
  return (
    <Stack gap="xs" h="100%">
      <Group justify="space-between">
        <Text size="sm">
          Brasil: <b className="num">{fmtPct(q.data.br.pct_secoes)}</b>{" "}
          <Text span c="dimmed" size="xs">
            ({fmtInt(q.data.br.secoes_totalizadas)} de {fmtInt(q.data.br.secoes_total)} seções)
          </Text>
        </Text>
        <Group gap={4}>
          <Text size="xs" c="dimmed">
            {metrica === "pct_secoes" ? "0%" : "60%"}
          </Text>
          <Box w={70} h={8} style={{ borderRadius: 4, background: gradienteCss(corSequencial) }} />
          <Text size="xs" c="dimmed">
            {metrica === "pct_secoes" ? "100%" : "95%"}
          </Text>
        </Group>
      </Group>
      {modo === "grade" ? (
        <Box
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 4,
            maxWidth: 520,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {itens.map((it) => (
            <Tile key={it.uf} it={it} metrica={metrica} onClick={() => onSelecionarUf?.(it.uf, it.nome)} />
          ))}
        </Box>
      ) : (
        <SimpleGrid cols={{ base: 3, sm: 5, md: 7 }} spacing={4}>
          {[...itens].sort((a, b) => b.pct_secoes - a.pct_secoes).map((it) => (
            <Paper key={it.uf} p={4} withBorder onClick={() => onSelecionarUf?.(it.uf, it.nome)} className="clicavel">
              <Text size="xs" fw={700}>
                {it.uf.toUpperCase()} <span className="num">{fmtPct(it.pct_secoes, 1)}</span>
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
