import { Alert, Button, Modal, Stack, Text } from "@mantine/core";
import { useAuth } from "../../../lib/auth-store";
import { useUi } from "../../../lib/ui-store";
import type { Dashboard } from "../repo";
import { ShareLinkForm, useShareLink } from "./ShareLinkForm";

interface ShareModalProps {
  dashboard: Dashboard | null;
  open: boolean;
  onClose: () => void;
}

/** Creates a public link to a dashboard (live or frozen in time). Needs the dashboard saved in the account. */
export function ShareModal({ dashboard, open, onClose }: ShareModalProps) {
  const loggedIn = !!useAuth((s) => s.token);
  const openAuth = useUi((s) => s.setAuthAberto);
  const share = useShareLink(dashboard);

  return (
    <Modal
      opened={open}
      onClose={() => {
        share.setLink(null);
        onClose();
      }}
      title={<Text fw={700}>Compartilhar painel</Text>}
      size="md"
    >
      {!loggedIn || !dashboard?.remote ? (
        <Stack>
          <Alert color="blue" variant="light">
            Para gerar um link público, o painel precisa estar salvo na sua conta. Entre ou crie uma conta e
            use “Enviar painéis locais para a conta”.
          </Alert>
          {!loggedIn && (
            <Button onClick={() => openAuth(true)} w="fit-content">
              Entrar
            </Button>
          )}
        </Stack>
      ) : (
        <ShareLinkForm dashboard={dashboard} share={share} />
      )}
    </Modal>
  );
}
