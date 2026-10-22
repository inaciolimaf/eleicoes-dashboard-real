import { ActionIcon, Card, Grid, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { useEffect } from "react";
import { usePollingPlace } from "../hooks";
import { PollingPlaceDetail } from "./PollingPlaceDetail";
import { TotalsBlock } from "../../results";
import { Scoreboard } from "../../results";
import { WithResults } from "../../results";
import { Evolution } from "../../charts";
import { FilterProvider, useEffectiveFilter } from "../../../lib/effective-filter";
import { useFilter } from "../../../lib/filter-store";
import { useFavorites } from "../../accounts";

export function PollingPlaceScreen({ id }: { id: string }) {
  const f = useEffectiveFilter();
  const q = usePollingPlace(id, f.turno);
  const { eFavorito, alternar } = useFavorites();
  useEffect(() => {
    if (id) useFilter.getState().setRecorte("polling_place", id, q.data?.name);
  }, [id, q.data?.name]);
  const fav = eFavorito("polling_place", id);
  return (
    <FilterProvider value={{ nivel: "polling_place", id }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Local de votação
            </Text>
            <Title order={2}>{q.data?.name ?? "Local de votação"}</Title>
          </Stack>
          <Tooltip label={fav ? "Remover dos favoritos" : "Favoritar (meu colégio)"}>
            <ActionIcon
              variant="subtle"
              color="yellow"
              size="lg"
              onClick={() => alternar({ type: "polling_place", ref: id, label: q.data?.name ?? id })}
              aria-label="Favoritar local"
            >
              {fav ? <IconStarFilled size={20} /> : <IconStar size={20} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Card p="md">
              <PollingPlaceDetail localId={id} alturaLista={420} />
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="md">
              <Card p="md">
                <Text fw={700} mb="xs">
                  Resultado agregado do local
                </Text>
                <WithResults>{(r) => <TotalsBlock res={r} />}</WithResults>
              </Card>
              <Card p="md">
                <WithResults linhasSkeleton={5}>{(r) => <Scoreboard res={r} />}</WithResults>
              </Card>
            </Stack>
          </Grid.Col>
          <Grid.Col span={12}>
            <Card p="md">
              <Text fw={700} mb="xs">
                Evolução (pelo horário de totalização dos BUs)
              </Text>
              <Evolution altura={260} />
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </FilterProvider>
  );
}
