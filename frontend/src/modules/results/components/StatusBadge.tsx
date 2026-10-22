import { Badge, Group, Tooltip } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import type { CandidateStatus } from "../../../api/models";
import { SITUATION_STYLES } from "../../../lib/palettes";
import { fmtTime } from "../../../lib/time";

interface Props {
  situacao: CandidateStatus;
  situacaoGeral?: CandidateStatus | null;
  /** ex.: "no Brasil", "em SP" */
  ondeGeral?: string;
  totalizadoEm?: string | null;
  size?: "xs" | "sm" | "md";
}

function Selo({
  s,
  sufixo,
  totalizadoEm,
  size,
}: {
  s: CandidateStatus;
  sufixo?: string;
  totalizadoEm?: string | null;
  size: "xs" | "sm" | "md";
}) {
  const est = SITUATION_STYLES[s] ?? SITUATION_STYLES.COUNTING;
  if (s === "COUNTING" && !sufixo) return null;
  const doTse = s !== "LEADING" && s !== "COUNTING";
  const label = (
    <>
      {est.descricao}
      {doTse && totalizadoEm ? ` Publicado às ${fmtTime(totalizadoEm)} (Brasília).` : ""}
    </>
  );
  return (
    <Tooltip label={label}>
      <Badge
        size={size}
        color={est.cor}
        variant={est.variante}
        leftSection={s === "ELECTED" ? <IconCheck size={12} stroke={3} /> : undefined}
        styles={{ root: { textTransform: "uppercase", letterSpacing: 0.3, flexShrink: 0 } }}
        aria-label={`Situação: ${est.rotulo}${sufixo ? " " + sufixo : ""}`}
      >
        {est.rotulo}
        {sufixo ? ` ${sufixo}` : ""}
      </Badge>
    </Tooltip>
  );
}

/** Selo de situação (RF-03). Mostra também a situação geral quando difere da local. */
export function StatusBadge({ situacao, situacaoGeral, ondeGeral, totalizadoEm, size = "sm" }: Props) {
  const mostrarGeral = situacaoGeral && situacaoGeral !== situacao && situacaoGeral !== "COUNTING";
  return (
    <Group gap={4} wrap="wrap">
      <Selo s={situacao} totalizadoEm={totalizadoEm} size={size} />
      {mostrarGeral && <Selo s={situacaoGeral} sufixo={ondeGeral} totalizadoEm={totalizadoEm} size={size} />}
    </Group>
  );
}
