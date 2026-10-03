import { ActionIcon, Card, Grid, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useLocal } from "../api/hooks";
import { DetalheLocal } from "../components/locais/DetalheLocal";
import { BlocoTotais } from "../components/resultados/BlocoTotais";
import { Placar } from "../components/resultados/Placar";
import { ComResultados } from "../components/resultados/ComResultados";
import { Evolucao } from "../components/graficos/Evolucao";
import { FiltroProvider, useFiltroEfetivo } from "../lib/filtro-efetivo";
import { useFiltro } from "../store/filtro";
import { useFavoritos } from "../store/favoritos";

export default function LocalPage() {
  const id = decodeURIComponent(useParams().id ?? "");
  const f = useFiltroEfetivo();
  const q = useLocal(id, f.turno);
  const { eFavorito, alternar } = useFavoritos();
  useEffect(() => {
    if (id) useFiltro.getState().setRecorte("local", id, q.data?.nome);
  }, [id, q.data?.nome]);
  const fav = eFavorito("local", id);
  return (
    <FiltroProvider value={{ nivel: "local", id }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Stack gap={0}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Local de votação
            </Text>
            <Title order={2}>{q.data?.nome ?? "Local de votação"}</Title>
          </Stack>
          <Tooltip label={fav ? "Remover dos favoritos" : "Favoritar (meu colégio)"}>
            <ActionIcon variant="subtle" color="yellow" size="lg" onClick={() => alternar({ tipo: "local", ref: id, rotulo: q.data?.nome ?? id })} aria-label="Favoritar local">
              {fav ? <IconStarFilled size={20} /> : <IconStar size={20} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Card p="md">
              <DetalheLocal localId={id} alturaLista={420} />
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="md">
              <Card p="md">
                <Text fw={700} mb="xs">
                  Resultado agregado do local
                </Text>
                <ComResultados>{(r) => <BlocoTotais res={r} />}</ComResultados>
              </Card>
              <Card p="md">
                <ComResultados linhasSkeleton={5}>{(r) => <Placar res={r} />}</ComResultados>
              </Card>
            </Stack>
          </Grid.Col>
          <Grid.Col span={12}>
            <Card p="md">
              <Text fw={700} mb="xs">
                Evolução (pelo horário de totalização dos BUs)
              </Text>
              <Evolucao altura={260} />
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </FiltroProvider>
  );
}
