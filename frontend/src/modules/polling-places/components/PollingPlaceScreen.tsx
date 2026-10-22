import { ActionIcon, Card, Grid, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { useEffect } from "react";
import { usePollingPlace } from "../hooks";
import { PollingPlaceDetail } from "./PollingPlaceDetail";
import { TotalsBlock, Scoreboard, WithResults } from "../../results";
import { Evolution } from "../../charts";
import { FilterProvider, useEffectiveFilter } from "../../../lib/effective-filter";
import { useFilter } from "../../../lib/filter-store";
import { useFavorites } from "../../accounts";

/** Polling place screen (`/locais/:id`): header with favorite toggle, the place, results and evolution. */
export function PollingPlaceScreen({ id }: { id: string }) {
  const filter = useEffectiveFilter();
  const query = usePollingPlace(id, filter.turno);
  const { isFavorite, toggle } = useFavorites();
  useEffect(() => {
    if (id) useFilter.getState().setGeoArea("polling_place", id, query.data?.name);
  }, [id, query.data?.name]);
  const favorite = isFavorite("polling_place", id);
  return (
    <FilterProvider value={{ nivel: "polling_place", id }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Local de votação
            </Text>
            <Title order={2}>{query.data?.name ?? "Local de votação"}</Title>
          </Stack>
          <Tooltip label={favorite ? "Remover dos favoritos" : "Favoritar (meu colégio)"}>
            <ActionIcon
              variant="subtle"
              color="yellow"
              size="lg"
              onClick={() => toggle({ type: "polling_place", ref: id, label: query.data?.name ?? id })}
              aria-label="Favoritar local"
            >
              {favorite ? <IconStarFilled size={20} /> : <IconStar size={20} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Card p="md">
              <PollingPlaceDetail placeId={id} listHeight={420} />
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="md">
              <Card p="md">
                <Text fw={700} mb="xs">
                  Resultado agregado do local
                </Text>
                <WithResults>{(r) => <TotalsBlock result={r} />}</WithResults>
              </Card>
              <Card p="md">
                <WithResults skeletonRows={5}>{(r) => <Scoreboard result={r} />}</WithResults>
              </Card>
            </Stack>
          </Grid.Col>
          <Grid.Col span={12}>
            <Card p="md">
              <Text fw={700} mb="xs">
                Evolução (pelo horário de totalização dos BUs)
              </Text>
              <Evolution height={260} />
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </FilterProvider>
  );
}
