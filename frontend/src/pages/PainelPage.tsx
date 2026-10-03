import { Button } from "@mantine/core";
import { Link, useParams } from "react-router-dom";
import { Carregando, ErroView, SemDados } from "../components/common/Estados";
import { PainelView } from "../paineis/PainelView";
import { usePaineis } from "../paineis/repo";

export default function PainelPage() {
  const id = useParams().id ?? "";
  const repo = usePaineis();
  if (repo.carregando) return <Carregando linhas={6} />;
  if (repo.erro) return <ErroView erro={repo.erro} />;
  const p = repo.paineis.find((x) => x.id === id);
  if (!p)
    return (
      <SemDados titulo="Painel não encontrado">
        Ele pode ter sido apagado ou pertencer a outra conta.{" "}
        <Button component={Link} to="/paineis" variant="subtle" size="compact-sm">
          Ver meus painéis
        </Button>
      </SemDados>
    );
  return <PainelView key={p.id} painel={p} />;
}
