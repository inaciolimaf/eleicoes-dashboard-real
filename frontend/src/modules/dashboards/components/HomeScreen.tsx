import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { IconEdit, IconLayoutGrid, IconSparkles } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loading, ErrorView } from "../../../components/States";
import { Grid } from "./Grid";
import { DashboardView, applyDashboardFilter } from "./DashboardView";
import { useDashboards } from "../repo";
import { TEMPLATES } from "../templates";
import { NewDashboardModal } from "./NewDashboardModal";
import { useFilter } from "../../../lib/filter-store";

/** "/" → painel padrão do usuário; sem painéis, mostra o template "Noite da eleição" ao vivo. */
export function HomeScreen() {
  const repo = useDashboards();
  if (repo.carregando) return <Loading linhas={6} />;
  if (repo.erro) return <ErrorView erro={repo.erro} />;
  const padrao = repo.paineis.find((p) => p.padrao) ?? repo.paineis[0];
  if (padrao) return <DashboardView key={padrao.id} painel={padrao} />;
  return <InitialTemplate />;
}

function InitialTemplate() {
  const repo = useDashboards();
  const navigate = useNavigate();
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState(false);
  const turno = useFilter((s) => s.turno);
  const config = useMemo(() => TEMPLATES[0].criar({ turno }), [turno]);
  useEffect(() => {
    applyDashboardFilter(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // o filtro global continua valendo (cargo/recorte escolhidos no cabeçalho)
  const f = useFilter();
  const cfg = useMemo(
    () => ({
      ...config,
      filtroGlobal: { ...config.filtroGlobal, cargo: f.cargo, nivel: f.nivel, recorte: f.id, turno: f.turno },
    }),
    [config, f.cargo, f.nivel, f.id, f.turno],
  );
  return (
    <Stack gap="sm">
      <Alert variant="light" icon={<IconSparkles />} py="xs">
        <Group justify="space-between" gap="xs">
          <Text size="sm">
            Este é o template <b>Noite da eleição – Presidente</b>. Personalize para salvar a sua versão
            (arrastar, redimensionar, adicionar widgets, compartilhar).
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconLayoutGrid size={14} />}
              onClick={() => setNovo(true)}
            >
              Outros templates
            </Button>
            <Button
              size="xs"
              leftSection={<IconEdit size={14} />}
              loading={criando}
              onClick={async () => {
                setCriando(true);
                try {
                  const p = await repo.criar("Noite da eleição", cfg, true);
                  navigate(`/paineis/${p.id}`);
                } finally {
                  setCriando(false);
                }
              }}
            >
              Personalizar
            </Button>
          </Group>
        </Group>
      </Alert>
      <Grid config={cfg} editando={false} somenteLeitura />
      <NewDashboardModal aberto={novo} onClose={() => setNovo(false)} />
    </Stack>
  );
}
