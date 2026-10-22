import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { IconEdit, IconLayoutGrid, IconSparkles } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { Grid } from "../grid/Grid";
import { useDashboards } from "../hooks";
import { TEMPLATES } from "../templates";
import { NewDashboardModal } from "../modals/NewDashboardModal";
import { useFilter } from "../../../lib/filter-store";
import { applyGlobalFilter } from "../filter-sync";

/** Home for a user without dashboards: the election-night template, live, with "personalize" and other templates. */
export function StarterDashboard() {
  const repo = useDashboards();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const round = useFilter((s) => s.turno);
  const config = useMemo(() => TEMPLATES[0].create({ round }), [round]);
  useEffect(() => {
    applyGlobalFilter(config);
    // loads the template's filter once; later changes of the header filter are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the global filter keeps applying (office and area chosen in the header)
  const filter = useFilter();
  const shownConfig = useMemo(
    () => ({
      ...config,
      filtroGlobal: {
        ...config.filtroGlobal,
        cargo: filter.cargo,
        nivel: filter.nivel,
        recorte: filter.id,
        turno: filter.turno,
      },
    }),
    [config, filter.cargo, filter.nivel, filter.id, filter.turno],
  );

  const personalize = async () => {
    setCreating(true);
    try {
      const created = await repo.create("Noite da eleição", shownConfig, true);
      navigate(`/paineis/${created.id}`);
    } finally {
      setCreating(false);
    }
  };

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
              onClick={() => setNewOpen(true)}
            >
              Outros templates
            </Button>
            <Button size="xs" leftSection={<IconEdit size={14} />} loading={creating} onClick={personalize}>
              Personalizar
            </Button>
          </Group>
        </Group>
      </Alert>
      <Grid config={shownConfig} editing={false} readOnly />
      <NewDashboardModal open={newOpen} onClose={() => setNewOpen(false)} />
    </Stack>
  );
}
