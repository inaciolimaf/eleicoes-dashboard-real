import { Card, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { MetricValue, humanLabel } from "./MetricValue";

type Dictionary = Record<string, unknown>;

const isScalar = (value: unknown) => value === null || typeof value !== "object";
const isPlainObject = (value: unknown) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Generic metrics: scalars as tiles, nested objects as cards (recursively), lists as one value. The /admin/health shape is free in the contract. */
export function Metrics({ data }: { data: Dictionary }) {
  const scalars = Object.entries(data).filter(([, value]) => isScalar(value));
  const groups = Object.entries(data).filter(([, value]) => isPlainObject(value)) as [string, Dictionary][];
  const lists = Object.entries(data).filter(([, value]) => Array.isArray(value));
  return (
    <Stack gap="md">
      {scalars.length > 0 && (
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
          {scalars.map(([key, value]) => (
            <Paper key={key} withBorder p="sm">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                {humanLabel(key)}
              </Text>
              <MetricValue value={value} />
            </Paper>
          ))}
        </SimpleGrid>
      )}
      {groups.map(([key, value]) => (
        <Card key={key} p="sm" withBorder>
          <Text fw={700} mb="xs">
            {humanLabel(key)}
          </Text>
          <Metrics data={value} />
        </Card>
      ))}
      {lists.map(([key, value]) => (
        <Card key={key} p="sm" withBorder>
          <Text fw={700} mb="xs">
            {humanLabel(key)}
          </Text>
          <MetricValue value={value} />
        </Card>
      ))}
    </Stack>
  );
}
