import { useParams } from "react-router-dom";
import { PollingPlaceScreen } from "../modules/polling-places";

export default function PollingPlacePage() {
  const id = decodeURIComponent(useParams().id ?? "");
  return <PollingPlaceScreen id={id} />;
}
