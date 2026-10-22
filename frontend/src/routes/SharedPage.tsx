import { useParams } from "react-router-dom";
import { SharedScreen } from "../modules/dashboards";

export default function SharedPage() {
  const token = useParams().token ?? "";
  return <SharedScreen token={token} />;
}
