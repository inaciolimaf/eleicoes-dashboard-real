import { Card, Grid, Stack, Text, Title } from "@mantine/core";
import { useEffect } from "react";
import { SectionDetail } from "./SectionDetail";
import { WithResults, TotalsBlock } from "../../results";
import { FilterProvider } from "../../../lib/effective-filter";
import { useFilter } from "../../../lib/filter-store";

/** Section screen (`/secoes/:id`): the ballot box of the section and the totals of the selected office. */
export function SectionScreen({ id }: { id: string }) {
  useEffect(() => {
    if (id) useFilter.getState().setGeoArea("section", id);
  }, [id]);
  return (
    <FilterProvider value={{ nivel: "section", id }}>
      <Stack gap="md">
        <Stack gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Seção eleitoral · boletim de urna
          </Text>
          <Title order={2}>Seção</Title>
        </Stack>
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Card p="md">
              <SectionDetail sectionId={id} />
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card p="md">
              <Text fw={700} mb="xs">
                Totais do cargo selecionado
              </Text>
              <WithResults>{(r) => <TotalsBlock result={r} compact />}</WithResults>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </FilterProvider>
  );
}
