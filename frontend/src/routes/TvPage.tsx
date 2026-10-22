import { useSearchParams } from "react-router-dom";
import { TvScreen } from "../modules/dashboards";

export default function TvPage() {
  const [sp] = useSearchParams();
  return <TvScreen sp={sp} />;
}
