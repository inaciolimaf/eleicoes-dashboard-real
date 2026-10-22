import { useParams } from "react-router-dom";
import { DashboardScreen } from "../modules/dashboards";

export default function DashboardPage() {
  const id = useParams().id ?? "";
  return <DashboardScreen id={id} />;
}
