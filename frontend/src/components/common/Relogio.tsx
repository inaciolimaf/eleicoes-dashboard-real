import { Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { brt, dayjs } from "../../lib/time";

/** Relógio de Brasília ou contagem regressiva. */
export function Relogio({ modo = "relogio", alvo, rotulo }: { modo?: "relogio" | "contagem"; alvo?: string | null; rotulo?: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (modo === "contagem" && alvo) {
    const diff = Math.max(0, dayjs(alvo).valueOf() - agora);
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return (
      <Stack gap={0} align="center" justify="center" h="100%">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          {rotulo || "Contagem regressiva"}
        </Text>
        <Text className="num" fw={800} style={{ fontSize: "clamp(1.6rem, 5vw, 3rem)", lineHeight: 1.1 }}>
          {d > 0 ? `${d}d ` : ""}
          {p(h)}:{p(m)}:{p(s)}
        </Text>
        <Text size="xs" c="dimmed">
          até {brt(alvo).format("DD/MM HH:mm")} (Brasília)
        </Text>
      </Stack>
    );
  }
  const b = brt(agora);
  return (
    <Stack gap={0} align="center" justify="center" h="100%">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {rotulo || "Horário de Brasília"}
      </Text>
      <Text className="num" fw={800} style={{ fontSize: "clamp(1.6rem, 5vw, 3rem)", lineHeight: 1.1 }}>
        {b.format("HH:mm:ss")}
      </Text>
      <Text size="xs" c="dimmed" tt="capitalize">
        {b.format("dddd, DD [de] MMMM")}
      </Text>
    </Stack>
  );
}
