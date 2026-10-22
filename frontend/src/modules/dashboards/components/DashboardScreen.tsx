import { Button } from "@mantine/core";
import { Link } from "react-router-dom";
import { Loading, ErrorView, NoData } from "../../../components/States";
import { DashboardView } from "./DashboardView";
import { useDashboards } from "../repo";

export function DashboardScreen({ id }: { id: string }) {
  const repo = useDashboards();
  if (repo.carregando) return <Loading linhas={6} />;
  if (repo.erro) return <ErrorView erro={repo.erro} />;
  const p = repo.paineis.find((x) => x.id === id);
  if (!p)
    return (
      <NoData titulo="Painel não encontrado">
        Ele pode ter sido apagado ou pertencer a outra conta.{" "}
        <Button component={Link} to="/paineis" variant="subtle" size="compact-sm">
          Ver meus painéis
        </Button>
      </NoData>
    );
  return <DashboardView key={p.id} painel={p} />;
}
