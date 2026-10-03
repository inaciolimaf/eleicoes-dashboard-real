import { Card, Grid, Stack, Text, Title } from "@mantine/core";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { DetalheSecao } from "../components/secoes/DetalheSecao";
import { ComResultados } from "../components/resultados/ComResultados";
import { BlocoTotais } from "../components/resultados/BlocoTotais";
import { FiltroProvider } from "../lib/filtro-efetivo";
import { useFiltro } from "../store/filtro";

export default function SecaoPage() {
  const params = useParams();
  // aceita /secoes/:id e /secoes/:uf/:mun/:zona/:secao (doc 09)
  const id = params.id
    ? decodeURIComponent(params.id)
    : params.uf && params.mun && params.zona && params.secao
      ? `${params.uf}${params.mun}-z${params.zona.padStart(4, "0")}-s${params.secao.padStart(4, "0")}`
      : "";
  useEffect(() => {
    if (id) useFiltro.getState().setRecorte("secao", id);
  }, [id]);
  return (
    <FiltroProvider value={{ nivel: "secao", id }}>
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
              <DetalheSecao secaoId={id} />
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card p="md">
              <Text fw={700} mb="xs">
                Totais do cargo selecionado
              </Text>
              <ComResultados>{(r) => <BlocoTotais res={r} compacto />}</ComResultados>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </FiltroProvider>
  );
}
