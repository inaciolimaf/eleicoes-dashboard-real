import { Badge, Group, Tooltip } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import type { Situacao } from "../../api/types";
import { SITUACAO } from "../../lib/cores";
import { fmtHora } from "../../lib/time";

interface Props {
  situacao: Situacao;
  situacaoGeral?: Situacao | null;
  /** ex.: "no Brasil", "em SP" */
  ondeGeral?: string;
  totalizadoEm?: string | null;
  size?: "xs" | "sm" | "md";
}

function Selo({ s, sufixo, totalizadoEm, size }: { s: Situacao; sufixo?: string; totalizadoEm?: string | null; size: "xs" | "sm" | "md" }) {
  const est = SITUACAO[s] ?? SITUACAO.EM_APURACAO;
  if (s === "EM_APURACAO" && !sufixo) return null;
  const doTse = s !== "LIDERANDO" && s !== "EM_APURACAO";
  const label = (
    <>
      {est.descricao}
      {doTse && totalizadoEm ? ` Publicado às ${fmtHora(totalizadoEm)} (Brasília).` : ""}
    </>
  );
  return (
    <Tooltip label={label}>
      <Badge
        size={size}
        color={est.cor}
        variant={est.variante}
        leftSection={s === "ELEITO" ? <IconCheck size={12} stroke={3} /> : undefined}
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
export function SeloSituacao({ situacao, situacaoGeral, ondeGeral, totalizadoEm, size = "sm" }: Props) {
  const mostrarGeral = situacaoGeral && situacaoGeral !== situacao && situacaoGeral !== "EM_APURACAO";
  return (
    <Group gap={4} wrap="wrap">
      <Selo s={situacao} totalizadoEm={totalizadoEm} size={size} />
      {mostrarGeral && <Selo s={situacaoGeral} sufixo={ondeGeral} totalizadoEm={totalizadoEm} size={size} />}
    </Group>
  );
}
