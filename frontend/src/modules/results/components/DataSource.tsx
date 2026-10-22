import { Group, Text, Tooltip } from "@mantine/core";
import { IconShieldCheck, IconShieldQuestion, IconShieldX } from "@tabler/icons-react";
import type { ResultsWithDataDto } from "../../../api/models";
import { fmtDateTime, fmtTime } from "../../../lib/time";

/** Rodapé de transparência (RF-10): fonte, idg, horário e assinatura JWS. */
export function DataSource({ res }: { res: ResultsWithDataDto }) {
  const Icone =
    res.jws_verified === true
      ? IconShieldCheck
      : res.jws_verified === false
        ? IconShieldX
        : IconShieldQuestion;
  const cor = res.jws_verified === true ? "teal" : res.jws_verified === false ? "red" : "gray";
  return (
    <Tooltip
      label={
        <>
          Fonte: {res.source === "tse" ? "arquivo de resultados do TSE" : "soma dos boletins de urna (BU)"}
          {res.generation_id ? ` · idg ${res.generation_id}` : ""}
          <br />
          Totalizado em {fmtDateTime(res.tallied_at)} · capturado em {fmtDateTime(res.captured_at)}
          <br />
          Assinatura JWS:{" "}
          {res.jws_verified === true
            ? "verificada"
            : res.jws_verified === false
              ? "FALHOU"
              : "não verificada"}
        </>
      }
    >
      <Group gap={4} wrap="nowrap" style={{ cursor: "help" }}>
        <Icone size={14} color={`var(--mantine-color-${cor}-5)`} />
        <Text size="xs" c="dimmed" className="num">
          {res.source === "tse" ? "TSE" : "BU"} · {fmtTime(res.tallied_at)}
        </Text>
      </Group>
    </Tooltip>
  );
}
