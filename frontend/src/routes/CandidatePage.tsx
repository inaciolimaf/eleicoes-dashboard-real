import { useParams } from "react-router-dom";
import { CandidateScreen } from "../modules/results";

export default function CandidatePage() {
  const sq = decodeURIComponent(useParams().tse_candidate_id ?? "");
  return <CandidateScreen sq={sq} />;
}
