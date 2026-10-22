import { useParams } from "react-router-dom";
import { SectionScreen } from "../modules/sections";
import { sectionIdFromParams } from "../lib/geo-areas";

export default function PollingSectionPage() {
  return <SectionScreen id={sectionIdFromParams(useParams())} />;
}
