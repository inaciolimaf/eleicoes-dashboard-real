import { Group, Text, Tooltip } from "@mantine/core";
import { IconShieldCheck, IconShieldQuestion, IconShieldX } from "@tabler/icons-react";
import type { ResultadosComDados } from "../../api/types";
import { fmtDataHora, fmtHora } from "../../lib/time";

/** Rodapé de transparência (RF-10): fonte, idg, horário e assinatura JWS. */
export function FonteDados({ res }: { res: ResultadosComDados }) {
  const Icone = res.jws_verificado === true ? IconShieldCheck : res.jws_verificado === false ? IconShieldX : IconShieldQuestion;
  const cor = res.jws_verificado === true ? "teal" : res.jws_verificado === false ? "red" : "gray";
  return (
    <Tooltip
      label={
        <>
          Fonte: {res.fonte === "tse" ? "arquivo de resultados do TSE" : "soma dos boletins de urna (BU)"}
          {res.idg ? ` · idg ${res.idg}` : ""}
          <br />
          Totalizado em {fmtDataHora(res.totalizado_em)} · capturado em {fmtDataHora(res.capturado_em)}
          <br />
          Assinatura JWS:{" "}
          {res.jws_verificado === true ? "verificada" : res.jws_verificado === false ? "FALHOU" : "não verificada"}
        </>
      }
    >
      <Group gap={4} wrap="nowrap" style={{ cursor: "help" }}>
        <Icone size={14} color={`var(--mantine-color-${cor}-5)`} />
        <Text size="xs" c="dimmed" className="num">
          {res.fonte === "tse" ? "TSE" : "BU"} · {fmtHora(res.totalizado_em)}
        </Text>
      </Group>
    </Tooltip>
  );
}
