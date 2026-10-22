import { Card, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";

/** Card of the explore screen: a title, optional controls on the right, then the content. */
export function ExploreBlock({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card p="md">
      <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
        <Text fw={700}>{title}</Text>
        {extra}
      </Group>
      {children}
    </Card>
  );
}
