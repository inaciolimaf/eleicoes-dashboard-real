import { useParams } from "react-router-dom";
import { SectionScreen } from "../modules/sections";

export default function PollingSectionPage() {
  const params = useParams();
  // aceita /secoes/:id e /secoes/:uf/:mun/:zona/:secao (doc 09)
  const id = params.id
    ? decodeURIComponent(params.id)
    : params.uf && params.mun && params.zona && params.secao
      ? `${params.uf}${params.mun}-z${params.zona.padStart(4, "0")}-s${params.secao.padStart(4, "0")}`
      : "";
  return <SectionScreen id={id} />;
}
