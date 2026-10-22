import { useParams } from "react-router-dom";
import { CandidateScreen } from "../modules/results";

export default function CandidatePage() {
  const sq = decodeURIComponent(useParams().sqcand ?? "");
  return <CandidateScreen sq={sq} />;
}
