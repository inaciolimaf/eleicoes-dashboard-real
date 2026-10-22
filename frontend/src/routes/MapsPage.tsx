import { useSearchParams } from "react-router-dom";
import { MapsScreen } from "../modules/maps";

export default function MapsPage() {
  const [sp, setSp] = useSearchParams();
  return <MapsScreen sp={sp} setSp={setSp} />;
}
