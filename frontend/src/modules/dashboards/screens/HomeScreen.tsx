import { ErrorView, Loading } from "../../../components/States";
import { DashboardView } from "../view/DashboardView";
import { useDashboards } from "../hooks";
import { StarterDashboard } from "./StarterDashboard";

/** "/": the user's default dashboard; with none, the ready-made election night, live. */
export function HomeScreen() {
  const repo = useDashboards();
  if (repo.isLoading) return <Loading linhas={6} />;
  if (repo.error) return <ErrorView erro={repo.error} />;
  const dashboard = repo.dashboards.find((d) => d.isDefault) ?? repo.dashboards[0];
  if (dashboard) return <DashboardView key={dashboard.id} dashboard={dashboard} />;
  return <StarterDashboard />;
}
