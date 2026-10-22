import { Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { brt, dayjs } from "../../../lib/time";

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

const twoDigits = (n: number) => String(n).padStart(2, "0");

/** Brasília clock, or a countdown to a given instant. */
export function Clock({
  mode = "relogio",
  target,
  label,
}: {
  mode?: "relogio" | "contagem";
  target?: string | null;
  label?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (mode === "contagem" && target) {
    const diff = Math.max(0, dayjs(target).valueOf() - now);
    const days = Math.floor(diff / MS_PER_DAY);
    const hours = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR);
    const minutes = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE);
    const seconds = Math.floor((diff % MS_PER_MINUTE) / 1000);
    return (
      <Stack gap={0} align="center" justify="center" h="100%">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          {label || "Contagem regressiva"}
        </Text>
        <Text className="num" fw={800} style={{ fontSize: "clamp(1.6rem, 5vw, 3rem)", lineHeight: 1.1 }}>
          {days > 0 ? `${days}d ` : ""}
          {twoDigits(hours)}:{twoDigits(minutes)}:{twoDigits(seconds)}
        </Text>
        <Text size="xs" c="dimmed">
          até {brt(target).format("DD/MM HH:mm")} (Brasília)
        </Text>
      </Stack>
    );
  }
  const brasilia = brt(now);
  return (
    <Stack gap={0} align="center" justify="center" h="100%">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label || "Horário de Brasília"}
      </Text>
      <Text className="num" fw={800} style={{ fontSize: "clamp(1.6rem, 5vw, 3rem)", lineHeight: 1.1 }}>
        {brasilia.format("HH:mm:ss")}
      </Text>
      <Text size="xs" c="dimmed" tt="capitalize">
        {brasilia.format("dddd, DD [de] MMMM")}
      </Text>
    </Stack>
  );
}
