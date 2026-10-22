import { Group, Text, Tooltip } from "@mantine/core";
import { IconShieldCheck, IconShieldQuestion, IconShieldX } from "@tabler/icons-react";
import type { ResultsWithDataDto } from "../../../api/models";
import { fmtDateTime, fmtTime } from "../../../lib/time";

function signatureIcon(verified: boolean | null | undefined) {
  if (verified === true) return IconShieldCheck;
  if (verified === false) return IconShieldX;
  return IconShieldQuestion;
}

function signatureColor(verified: boolean | null | undefined): string {
  if (verified === true) return "teal";
  if (verified === false) return "red";
  return "gray";
}

function signatureLabel(verified: boolean | null | undefined): string {
  if (verified === true) return "verificada";
  if (verified === false) return "FALHOU";
  return "não verificada";
}

/** Transparency footer (RF-10): source, generation id, time and JWS signature. */
export function DataSource({ result }: { result: ResultsWithDataDto }) {
  const Icon = signatureIcon(result.jws_verified);
  const color = signatureColor(result.jws_verified);
  return (
    <Tooltip
      label={
        <>
          Fonte: {result.source === "tse" ? "arquivo de resultados do TSE" : "soma dos boletins de urna (BU)"}
          {result.generation_id ? ` · idg ${result.generation_id}` : ""}
          <br />
          Totalizado em {fmtDateTime(result.tallied_at)} · capturado em {fmtDateTime(result.captured_at)}
          <br />
          Assinatura JWS: {signatureLabel(result.jws_verified)}
        </>
      }
    >
      <Group gap={4} wrap="nowrap" style={{ cursor: "help" }}>
        <Icon size={14} color={`var(--mantine-color-${color}-5)`} />
        <Text size="xs" c="dimmed" className="num">
          {result.source === "tse" ? "TSE" : "BU"} · {fmtTime(result.tallied_at)}
        </Text>
      </Group>
    </Tooltip>
  );
}
