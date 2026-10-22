import { Badge, Code, Text } from "@mantine/core";
import { fmtNum } from "../../../lib/formatting";
import { fmtDateTime } from "../../../lib/time";

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

/** Turns a metric key such as `last_tally` into a readable label ("Last tally"). */
export function humanLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** One metric value, formatted by its type: boolean badge, number, date, text or JSON block. */
export function MetricValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Text c="dimmed">—</Text>;
  if (typeof value === "boolean")
    return (
      <Badge color={value ? "teal" : "gray"} variant="light">
        {value ? "sim" : "não"}
      </Badge>
    );
  if (typeof value === "number")
    return (
      <Text fw={700} className="num" fz="lg">
        {fmtNum(value, 2)}
      </Text>
    );
  if (typeof value === "string" && ISO_DATETIME.test(value))
    return <Text className="num">{fmtDateTime(value)}</Text>;
  if (typeof value === "string") return <Text fw={600}>{value}</Text>;
  return (
    <Code block style={{ maxHeight: 180, overflow: "auto" }}>
      {JSON.stringify(value, null, 2)}
    </Code>
  );
}
