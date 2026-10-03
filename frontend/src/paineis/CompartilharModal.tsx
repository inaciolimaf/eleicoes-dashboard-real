import { Alert, Button, CopyButton, Group, Modal, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { IconCheck, IconCopy, IconLink } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../api/client";
import type { CompartilharResp } from "../api/types";
import { useAuth } from "../store/auth";
import { useTempo } from "../store/tempo";
import { useUi } from "../store/ui";
import { dayjs } from "../lib/time";
import type { Painel } from "./repo";

export function CompartilharModal({ painel, aberto, onClose }: { painel: Painel | null; aberto: boolean; onClose: () => void }) {
  const logado = !!useAuth((s) => s.token);
  const t = useTempo((s) => s.t);
  const [modo, setModo] = useState<"ao_vivo" | "congelado">("ao_vivo");
  const [tempo, setTempo] = useState<Date | null>(t ? new Date(t) : new Date());
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const setAuth = useUi((s) => s.setAuthAberto);

  const gerar = async () => {
    if (!painel) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await api<CompartilharResp>(`/paineis/${painel.id}/compartilhar`, {
        method: "POST",
        body: { modo, tempo: modo === "congelado" && tempo ? dayjs(tempo).toISOString() : undefined },
      });
      setLink(`${location.origin}/p/${encodeURIComponent(r.token)}`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Modal opened={aberto} onClose={() => { setLink(null); onClose(); }} title={<Text fw={700}>Compartilhar painel</Text>} size="md">
      {!logado || !painel?.remoto ? (
        <Stack>
          <Alert color="blue" variant="light">
            Para gerar um link público, o painel precisa estar salvo na sua conta. Entre ou crie uma conta e use “Enviar painéis locais para a conta”.
          </Alert>
          {!logado && (
            <Button onClick={() => setAuth(true)} w="fit-content">
              Entrar
            </Button>
          )}
        </Stack>
      ) : (
        <Stack>
          <Text size="sm" c="dimmed">
            O link abre o painel “{painel.nome}” em modo somente leitura, sem precisar de login.
          </Text>
          <SegmentedControl
            value={modo}
            onChange={(v) => setModo(v as typeof modo)}
            data={[
              { value: "ao_vivo", label: "Seguir ao vivo" },
              { value: "congelado", label: "Congelado no tempo T" },
            ]}
          />
          {modo === "congelado" && (
            <DateTimePicker label="Instante (horário de Brasília)" value={tempo} onChange={setTempo} valueFormat="DD/MM/YYYY HH:mm" />
          )}
          <Button leftSection={<IconLink size={16} />} onClick={gerar} loading={carregando}>
            Gerar link
          </Button>
          {erro && (
            <Alert color="red" variant="light">
              {erro}
            </Alert>
          )}
          {link && (
            <Group gap={6} wrap="nowrap">
              <TextInput value={link} readOnly style={{ flex: 1 }} onFocus={(e) => e.currentTarget.select()} />
              <CopyButton value={link}>
                {({ copied, copy }) => (
                  <Button color={copied ? "teal" : undefined} onClick={copy} leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}>
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                )}
              </CopyButton>
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}
