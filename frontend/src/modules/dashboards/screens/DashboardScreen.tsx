import { Button } from "@mantine/core";
import { Link } from "react-router-dom";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { DashboardView } from "../view/DashboardView";
import { useDashboards } from "../hooks";

/** "/paineis/:id": one dashboard, in the editor or read-only, depending on the user's choice. */
export function DashboardScreen({ id }: { id: string }) {
  const repo = useDashboards();
  if (repo.isLoading) return <Loading rows={6} />;
  if (repo.error) return <ErrorView error={repo.error} />;
  const dashboard = repo.dashboards.find((x) => x.id === id);
  if (!dashboard)
    return (
      <NoData title="Painel não encontrado">
        Ele pode ter sido apagado ou pertencer a outra conta.{" "}
        <Button component={Link} to="/paineis" variant="subtle" size="compact-sm">
          Ver meus painéis
        </Button>
      </NoData>
    );
  return <DashboardView key={dashboard.id} dashboard={dashboard} />;
}
