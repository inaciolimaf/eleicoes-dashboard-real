import { Badge, Box, Group, Stack, Text } from "@mantine/core";
import { IconArrowDownRight, IconArrowUpRight, IconMinus } from "@tabler/icons-react";
import { useMemo } from "react";
import {
  useResults,
  WithResults,
  Scoreboard,
  TotalsBlock,
  GeoAreaTable,
  CandidateAvatar,
} from "../../results";
import type { ResultsWithDataDto } from "../../../api/models";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { dayjs } from "../../../lib/time";
import { fmtInt, fmtPP } from "../../../lib/formatting";
import { Hemicycle, Donut, Evolution, ProgressHeatmap } from "../../charts";
import { ElectoralMap, type MapType } from "../../maps";
import { type ColumnId } from "../../results";
import { Num } from "../../../components/Num";
import { NoData } from "../../../components/States";
import { ScrollBody } from "./scroll-body";
import {
  configArray,
  configBool,
  configNumber,
  configString,
  configStringOrNull,
  type WidgetProps,
} from "./types";

// 1 ─ Scoreboard
export function ScoreboardWidget({ config, height, onSelect }: WidgetProps) {
  return (
    <ScrollBody height={height}>
      <WithResults onUf={(uf, name) => onSelect("state", uf, name)}>
        {(results) => (
          <Scoreboard
            res={results}
            opcoes={{
              topN: configNumber(config, "topN", 0),
              soEleitos: configBool(config, "soEleitos", false),
              mostrarFotos: configBool(config, "mostrarFotos", true),
            }}
          />
        )}
      </WithResults>
    </ScrollBody>
  );
}

// 2 ─ Totals block
export function TotalsWidget({ config, height, onSelect }: WidgetProps) {
  return (
    <ScrollBody height={height}>
      <WithResults onUf={(uf, name) => onSelect("state", uf, name)}>
        {(results) => (
          <TotalsBlock res={results} compacto={configBool(config, "compacto", false) || height < 200} />
        )}
      </WithResults>
    </ScrollBody>
  );
}

// 3 ─ KPI
interface KpiMetric {
  label: string;
  kind: "int" | "pct";
  get: (results: ResultsWithDataDto, candidateId: string | null) => number | null;
}

/** Metrics a KPI widget can show. The keys are saved in the dashboard JSON (`metrica`). */
const KPI_METRICS: Record<string, KpiMetric> = {
  votos_validos: { label: "Votos válidos", kind: "int", get: (r) => r.totals.valid_votes },
  pct_secoes: { label: "Seções apuradas", kind: "pct", get: (r) => r.totals.pct_sections },
  comparecimento: { label: "Comparecimento", kind: "int", get: (r) => r.totals.turnout },
  pct_comparecimento: { label: "% comparecimento", kind: "pct", get: (r) => r.totals.pct_turnout },
  pct_abstencao: { label: "% abstenção", kind: "pct", get: (r) => r.totals.pct_abstention },
  brancos: { label: "Votos brancos", kind: "int", get: (r) => r.totals.blank_votes },
  nulos: { label: "Votos nulos", kind: "int", get: (r) => r.totals.null_votes },
  margem_pp: { label: "Margem 1º × 2º (p.p.)", kind: "pct", get: (r) => r.leader?.margin_pp ?? null },
  candidato_pct: {
    label: "% do candidato",
    kind: "pct",
    get: (r, candidateId) =>
      r.candidates.find((c) => c.tse_candidate_id === candidateId)?.valid_pct ??
      r.candidates[0]?.valid_pct ??
      null,
  },
  candidato_votos: {
    label: "Votos do candidato",
    kind: "int",
    get: (r, candidateId) =>
      r.candidates.find((c) => c.tse_candidate_id === candidateId)?.votes ?? r.candidates[0]?.votes ?? null,
  },
};
export const KPI_OPTIONS = Object.entries(KPI_METRICS).map(([value, m]) => ({ value, label: m.label }));

function DeltaBadge({ delta, kind, minutes }: { delta: number; kind: KpiMetric["kind"]; minutes: number }) {
  const icon =
    delta > 0 ? (
      <IconArrowUpRight size={12} />
    ) : delta < 0 ? (
      <IconArrowDownRight size={12} />
    ) : (
      <IconMinus size={12} />
    );
  return (
    <Badge variant="light" color={delta > 0 ? "teal" : delta < 0 ? "red" : "gray"} leftSection={icon}>
      {kind === "pct" ? fmtPP(delta) : fmtInt(delta)} em {minutes} min
    </Badge>
  );
}

export function KpiWidget({ config }: WidgetProps) {
  const filter = useEffectiveFilter();
  const metric = KPI_METRICS[configString(config, "metrica", "votos_validos")] ?? KPI_METRICS.votos_validos;
  const candidateId = configStringOrNull(config, "sqcand");
  const minutes = configNumber(config, "compararMin", 15);
  const reference = useMemo(
    () =>
      dayjs(filter.t ?? undefined)
        .subtract(minutes, "minute")
        .startOf("minute")
        .toISOString(),
    // recomputed every minute in live mode, when the time of the filter is empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter.t, minutes, filter.t ? 0 : Math.floor(Date.now() / 60_000)],
  );
  const previous = useResults({ ...filter, t: reference }, minutes > 0);
  const highlightColor = configString(config, "corDestaque", "");
  return (
    <WithResults linhasSkeleton={1}>
      {(results) => {
        const value = metric.get(results, candidateId);
        const previousValue =
          previous.data && !previous.data.no_data ? metric.get(previous.data, candidateId) : null;
        const delta = value !== null && previousValue !== null ? value - previousValue : null;
        const candidate = metric.label.includes("candidato")
          ? (results.candidates.find((c) => c.tse_candidate_id === candidateId) ?? results.candidates[0])
          : null;
        return (
          <Stack gap={4} justify="center" h="100%" px="xs">
            <Group gap={6}>
              {candidate && (
                <CandidateAvatar
                  fotoUrl={candidate.photo_url}
                  nome={candidate.ballot_name}
                  cor={candidate.color}
                  size={26}
                />
              )}
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                {candidate ? `${candidate.ballot_name} · ` : ""}
                {metric.label}
              </Text>
            </Group>
            <Num
value={value}
kind={metric.kind}
              style={{
                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                fontWeight: 800,
                lineHeight: 1.05,
                color: highlightColor || undefined,
              }}
            />
            {minutes > 0 && (
              <Group gap={4}>
                {delta === null ? (
                  <Text size="xs" c="dimmed">
                    sem comparação há {minutes} min
                  </Text>
                ) : (
                  <DeltaBadge delta={delta} kind={metric.kind} minutes={minutes} />
                )}
              </Group>
            )}
          </Stack>
        );
      }}
    </WithResults>
  );
}

// 4 ─ Map
export function MapWidget({ config, height, onSelect, widget }: WidgetProps) {
  const filter = useEffectiveFilter();
  const basemap = configString(config, "basemap", "padrao");
  return (
    <Box h={height} style={{ borderRadius: 10, overflow: "hidden" }} key={widget.id}>
      <ElectoralMap
kind={configString(config, "tipo", "vencedores") as MapType}
level={filter.nivel}
        id={filter.id}
allMunicipalities={configString(config, "nivelFilhos", "auto") === "municipio"}
candidateA={configStringOrNull(config, "candidatoA")}
candidateB={configStringOrNull(config, "candidatoB")}
        basemap={basemap === "padrao" ? undefined : basemap === "sim"}
onSelect={onSelect}
height={height}
      />
    </Box>
  );
}

// 5 ─ Evolution
export function EvolutionWidget({ config, height }: WidgetProps) {
  return (
    <Evolution
      eixoX={configString(config, "eixoX", "t") as "t" | "pct_secoes"}
      metrica={configString(config, "metrica", "pct") as "pct" | "votos" | "diferenca"}
      estilo={configString(config, "estilo", "linha") as "linha" | "area"}
      topN={configNumber(config, "topN", 6)}
      altura={height}
    />
  );
}

// 6 ─ Table of areas
export function TableWidget({ config, height, onSelect }: WidgetProps) {
  const filter = useEffectiveFilter();
  const childrenSetting = configString(config, "nivelFilhos", "auto");
  const columns = configArray(config, "colunas") as ColumnId[];
  return (
    <ScrollBody height={height}>
      <GeoAreaTable
        nivel={filter.nivel}
        id={filter.id}
        filhos={childrenSetting === "municipio" && filter.nivel === "country" ? "municipality" : null}
        colunas={columns.length ? columns : undefined}
        topN={configNumber(config, "topN", 0) || undefined}
        mostrarFiltros={configBool(config, "mostrarFiltros", true)}
        onSelecionar={onSelect}
        alturaMax={Math.max(160, height - 110)}
        porPagina={25}
      />
    </ScrollBody>
  );
}

// 8 ─ Hemicycle
export function HemicycleWidget({ height, onSelect }: WidgetProps) {
  return (
    <WithResults onUf={(uf, name) => onSelect("state", uf, name)}>
      {(results) =>
        results.office.voting_system !== "proporcional" || !results.alliances.length ? (
          <NoData title="Hemiciclo indisponível">
            O hemiciclo de vagas é exibido para cargos proporcionais (deputados), depois que o TSE publica a
            distribuição de vagas.
          </NoData>
        ) : (
          <Stack gap={4}>
            <Hemicycle agremiacoes={results.alliances} height={Math.max(160, height - 50)} />
            <Group gap={6} justify="center">
              {[...results.alliances]
                .filter((alliance) => (alliance.seats ?? 0) > 0)
                .sort((a, b) => (b.seats ?? 0) - (a.seats ?? 0))
                .slice(0, 10)
                .map((alliance) => (
                  <Badge key={alliance.name} variant="dot" color={alliance.color} size="sm">
                    {alliance.name} {alliance.seats}
                  </Badge>
                ))}
            </Group>
          </Stack>
        )
      }
    </WithResults>
  );
}

// 9 ─ Donut
export function DonutWidget({ config, height, onSelect }: WidgetProps) {
  return (
    <WithResults onUf={(uf, name) => onSelect("state", uf, name)}>
      {(results) => (
        <Donut
          res={results}
          topN={configNumber(config, "topN", 6)}
          incluirBrancosNulos={configBool(config, "incluirBrancosNulos", false)}
          altura={height}
        />
      )}
    </WithResults>
  );
}

// 10 ─ Progress heatmap
export function HeatmapWidget({ config, height, onSelect }: WidgetProps) {
  return (
    <ScrollBody height={height}>
      <ProgressHeatmap
        metrica={configString(config, "metrica", "pct_secoes") as "pct_secoes" | "pct_comparecimento"}
        onSelecionarUf={(uf, name) => onSelect("state", uf, name)}
      />
    </ScrollBody>
  );
}
