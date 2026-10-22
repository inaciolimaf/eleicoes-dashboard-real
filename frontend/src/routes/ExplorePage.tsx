import { useParams } from "react-router-dom";
import { ExploreScreen } from "../modules/results";

export default function ExplorePage() {
  const params = useParams();
  return <ExploreScreen params={params} />;
}
