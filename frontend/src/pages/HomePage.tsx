import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { IconEdit, IconLayoutGrid, IconSparkles } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Carregando, ErroView } from "../components/common/Estados";
import { Grade } from "../paineis/Grade";
import { PainelView, aplicarFiltroDoPainel } from "../paineis/PainelView";
import { usePaineis } from "../paineis/repo";
import { TEMPLATES } from "../paineis/templates";
import { NovoPainelModal } from "../paineis/NovoPainelModal";
import { useFiltro } from "../store/filtro";

/** "/" → painel padrão do usuário; sem painéis, mostra o template "Noite da eleição" ao vivo. */
export default function HomePage() {
  const repo = usePaineis();
  if (repo.carregando) return <Carregando linhas={6} />;
  if (repo.erro) return <ErroView erro={repo.erro} />;
  const padrao = repo.paineis.find((p) => p.padrao) ?? repo.paineis[0];
  if (padrao) return <PainelView key={padrao.id} painel={padrao} />;
  return <TemplateInicial />;
}

function TemplateInicial() {
  const repo = usePaineis();
  const navigate = useNavigate();
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState(false);
  const turno = useFiltro((s) => s.turno);
  const config = useMemo(() => TEMPLATES[0].criar({ turno }), [turno]);
  useEffect(() => {
    aplicarFiltroDoPainel(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // o filtro global continua valendo (cargo/recorte escolhidos no cabeçalho)
  const f = useFiltro();
  const cfg = useMemo(
    () => ({ ...config, filtroGlobal: { ...config.filtroGlobal, cargo: f.cargo, nivel: f.nivel, recorte: f.id, turno: f.turno } }),
    [config, f.cargo, f.nivel, f.id, f.turno],
  );
  return (
    <Stack gap="sm">
      <Alert variant="light" icon={<IconSparkles />} py="xs">
        <Group justify="space-between" gap="xs">
          <Text size="sm">
            Este é o template <b>Noite da eleição – Presidente</b>. Personalize para salvar a sua versão (arrastar, redimensionar, adicionar widgets, compartilhar).
          </Text>
          <Group gap="xs">
            <Button size="xs" variant="default" leftSection={<IconLayoutGrid size={14} />} onClick={() => setNovo(true)}>
              Outros templates
            </Button>
            <Button
              size="xs"
              leftSection={<IconEdit size={14} />}
              loading={criando}
              onClick={async () => {
                setCriando(true);
                try {
                  const p = await repo.criar("Noite da eleição", cfg, true);
                  navigate(`/paineis/${p.id}`);
                } finally {
                  setCriando(false);
                }
              }}
            >
              Personalizar
            </Button>
          </Group>
        </Group>
      </Alert>
      <Grade config={cfg} editando={false} somenteLeitura />
      <NovoPainelModal aberto={novo} onClose={() => setNovo(false)} />
    </Stack>
  );
}
