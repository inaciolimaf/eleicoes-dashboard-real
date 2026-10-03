import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { IconLayoutDashboard, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Carregando, ErroView } from "../components/common/Estados";
import { PainelView } from "../paineis/PainelView";
import { usePaineis } from "../paineis/repo";
import { TEMPLATES } from "../paineis/templates";
import { NovoPainelModal } from "../paineis/NovoPainelModal";

/** "/" → painel padrão do usuário (ou cria o template "Noite da eleição"). */
export default function HomePage() {
  const repo = usePaineis();
  const navigate = useNavigate();
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState(false);
  if (repo.carregando) return <Carregando linhas={6} />;
  if (repo.erro) return <ErroView erro={repo.erro} />;
  const padrao = repo.paineis.find((p) => p.padrao) ?? repo.paineis[0];
  if (padrao) return <PainelView key={padrao.id} painel={padrao} />;
  return (
    <Stack gap="md" maw={760} mx="auto" py="xl">
      <Alert variant="light" icon={<IconSparkles />} title="Bem-vindo à apuração ao vivo">
        <Text size="sm">
          Comece pelo painel “Noite da eleição – Presidente” (placar, totais, mapa de vencedores, evolução e eventos) ou escolha outro template. Você pode personalizar tudo:
          arrastar, redimensionar, adicionar widgets e compartilhar.
        </Text>
      </Alert>
      <Group>
        <Button
          size="md"
          leftSection={<IconLayoutDashboard size={18} />}
          loading={criando}
          onClick={async () => {
            setCriando(true);
            try {
              const p = await repo.criar("Noite da eleição", TEMPLATES[0].criar({}), true);
              navigate(`/paineis/${p.id}`);
            } finally {
              setCriando(false);
            }
          }}
        >
          Abrir “Noite da eleição”
        </Button>
        <Button size="md" variant="default" onClick={() => setNovo(true)}>
          Ver todos os templates
        </Button>
      </Group>
      <NovoPainelModal aberto={novo} onClose={() => setNovo(false)} />
    </Stack>
  );
}
