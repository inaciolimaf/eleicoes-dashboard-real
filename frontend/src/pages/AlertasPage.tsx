import { ActionIcon, Alert, Badge, Button, Card, Group, NumberInput, Select, Stack, Switch, Table, Text, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBell, IconBellRinging, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useAlertas, useApagarAlerta, useSalvarAlerta } from "../api/hooks";
import type { Alerta, TipoAlerta } from "../api/types";
import { CandidatoPicker, RecortePicker, lerRecorte, valorRecorte } from "../components/common/Pickers";
import { Carregando, ErroView, SemDados } from "../components/common/Estados";
import { NOME_CARGO, OPCOES_CARGO } from "../lib/cargos";
import { nomeRecortePadrao, ufDoId } from "../lib/recortes";
import { fmtDataCurta } from "../lib/time";
import { useAuth } from "../store/auth";
import { useFiltro } from "../store/filtro";
import { usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import type { Nivel } from "../api/types";

const TIPOS: { value: TipoAlerta; label: string }[] = [
  { value: "pct_candidato", label: "Quando um candidato passar de X%" },
  { value: "virada", label: "Quando houver virada em um recorte" },
  { value: "apuracao", label: "Quando a apuração chegar a N%" },
  { value: "eleito", label: "Quando o candidato for eleito" },
  { value: "local_apurado", label: "Quando um local de votação for apurado" },
];

function descrever(a: Alerta): string {
  const p = a.params as Record<string, string | number | undefined>;
  const onde = p.nivel && p.id ? nomeRecortePadrao(p.nivel as Nivel, String(p.id)) : "";
  switch (a.tipo) {
    case "pct_candidato":
      return `Candidato ${p.sqcand} passar de ${p.limite}% (${NOME_CARGO[Number(p.cargo)] ?? ""}${onde ? ` · ${onde}` : ""})`;
    case "virada":
      return `Virada em ${onde || "—"} (${NOME_CARGO[Number(p.cargo)] ?? ""})`;
    case "apuracao":
      return `Apuração de ${onde || "—"} chegar a ${p.limite}%`;
    case "eleito":
      return `Candidato ${p.sqcand} ser eleito`;
    case "local_apurado":
      return `Local ${p.local_id} ser 100% apurado`;
  }
  return a.tipo;
}

function NovoAlerta() {
  const f = useFiltro();
  const salvar = useSalvarAlerta();
  const [tipo, setTipo] = useState<TipoAlerta>("pct_candidato");
  const [cargo, setCargo] = useState(f.cargo);
  const [recorte, setRecorte] = useState<string | null>(valorRecorte(f.nivel, f.id));
  const [sq, setSq] = useState<string | null>(null);
  const [limite, setLimite] = useState<number>(50);
  const [local, setLocal] = useState<string | null>(null);
  const r = lerRecorte(recorte);
  const precisa = {
    cargo: tipo === "pct_candidato" || tipo === "virada" || tipo === "eleito",
    recorte: tipo === "pct_candidato" || tipo === "virada" || tipo === "apuracao",
    candidato: tipo === "pct_candidato" || tipo === "eleito",
    limite: tipo === "pct_candidato" || tipo === "apuracao",
    local: tipo === "local_apurado",
  };
  const criar = async () => {
    const params: Record<string, unknown> = {};
    if (tipo === "pct_candidato") Object.assign(params, { cargo, nivel: r?.nivel, id: r?.id, sqcand: sq, limite });
    if (tipo === "virada") Object.assign(params, { cargo, nivel: r?.nivel, id: r?.id });
    if (tipo === "apuracao") Object.assign(params, { nivel: r?.nivel, id: r?.id, limite });
    if (tipo === "eleito") Object.assign(params, { sqcand: sq });
    if (tipo === "local_apurado") Object.assign(params, { local_id: lerRecorte(local)?.id });
    if (Object.values(params).some((v) => v === undefined || v === null)) {
      notifications.show({ color: "red", message: "Preencha todos os campos do alerta." });
      return;
    }
    try {
      await salvar.mutateAsync({ tipo, params, ativo: true });
      notifications.show({ color: "teal", message: "Alerta criado." });
    } catch (e) {
      notifications.show({ color: "red", title: "Falha ao criar alerta", message: (e as Error).message });
    }
  };
  return (
    <Card p="md">
      <Text fw={700} mb="sm">
        Novo alerta
      </Text>
      <Stack gap="sm">
        <Select label="Regra" data={TIPOS} value={tipo} onChange={(v) => v && setTipo(v as TipoAlerta)} allowDeselect={false} />
        <Group grow align="flex-start">
          {precisa.cargo && (
            <Select label="Cargo" data={OPCOES_CARGO.map((o) => ({ value: o.valor, label: o.rotulo }))} value={String(cargo === 8 ? 7 : cargo)} onChange={(v) => setCargo(Number(v ?? 1))} allowDeselect={false} />
          )}
          {precisa.recorte && <RecortePicker label="Recorte" value={recorte} onChange={(v) => setRecorte(v)} />}
        </Group>
        <Group grow align="flex-start">
          {precisa.candidato && <CandidatoPicker label="Candidato" value={sq} onChange={setSq} turno={f.turno} cargo={cargo} uf={r ? ufDoId(r.nivel, r.id) : null} />}
          {precisa.limite && <NumberInput label="Limite (%)" value={limite} onChange={(v) => setLimite(Number(v) || 0)} min={0} max={100} decimalScale={2} />}
        </Group>
        {precisa.local && <RecortePicker label="Local de votação" tipos={["local"]} incluirBrasil={false} incluirUfs={false} value={local} onChange={(v) => setLocal(v)} />}
        <Group justify="flex-end">
          <Button leftSection={<IconBellRinging size={16} />} onClick={criar} loading={salvar.isPending}>
            Criar alerta
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export default function AlertasPage() {
  const logado = !!useAuth((s) => s.token);
  const setAuth = useUi((s) => s.setAuthAberto);
  const q = useAlertas();
  const salvar = useSalvarAlerta();
  const apagar = useApagarAlerta();
  const push = usePrefs((s) => s.push);
  const setPrefs = usePrefs((s) => s.set);
  const permissao = typeof Notification !== "undefined" ? Notification.permission : "denied";

  const ativarPush = async () => {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission();
    setPrefs({ push: r === "granted" });
    if (r === "granted") new Notification("Notificações ativadas", { body: "Você receberá os alertas da apuração.", icon: "/favicon.svg" });
  };

  return (
    <Stack gap="md" maw={980} mx="auto">
      <Stack gap={0}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          Notificações
        </Text>
        <Title order={2}>Alertas</Title>
      </Stack>
      <Card p="md">
        <Group justify="space-between">
          <Stack gap={0}>
            <Text fw={700}>Push do navegador</Text>
            <Text size="sm" c="dimmed">
              Receba os alertas mesmo com a aba em segundo plano. Os toasts no app funcionam sempre.
            </Text>
          </Stack>
          {permissao === "granted" ? (
            <Switch label="Ativo" checked={push} onChange={(e) => setPrefs({ push: e.currentTarget.checked })} />
          ) : (
            <Button leftSection={<IconBell size={16} />} onClick={ativarPush} disabled={permissao === "denied"}>
              {permissao === "denied" ? "Bloqueado no navegador" : "Permitir notificações"}
            </Button>
          )}
        </Group>
      </Card>
      {!logado ? (
        <Alert variant="light" color="blue" title="Entre para criar alertas">
          <Group justify="space-between">
            <Text size="sm">As regras de alerta ficam na sua conta e são avaliadas pelo servidor durante a apuração.</Text>
            <Button size="xs" onClick={() => setAuth(true)}>
              Entrar
            </Button>
          </Group>
        </Alert>
      ) : (
        <>
          <NovoAlerta />
          <Card p="md">
            <Text fw={700} mb="sm">
              Meus alertas
            </Text>
            {q.isLoading ? (
              <Carregando linhas={3} />
            ) : q.error ? (
              <ErroView erro={q.error} onRetry={() => q.refetch()} />
            ) : !q.data?.length ? (
              <SemDados titulo="Nenhum alerta">Crie uma regra acima.</SemDados>
            ) : (
              <Table verticalSpacing="xs" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Regra</Table.Th>
                    <Table.Th>Disparado</Table.Th>
                    <Table.Th>Ativo</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {q.data.map((a) => (
                    <Table.Tr key={a.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Badge size="xs" variant="light" w="fit-content">
                            {TIPOS.find((t) => t.value === a.tipo)?.label ?? a.tipo}
                          </Badge>
                          <Text size="sm">{descrever(a)}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" className="num">
                          {a.disparado_em ? fmtDataCurta(a.disparado_em) : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Switch checked={a.ativo} onChange={(e) => salvar.mutate({ ...a, ativo: e.currentTarget.checked })} aria-label="Ativo" />
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="Apagar">
                          <ActionIcon color="red" variant="subtle" onClick={() => apagar.mutate(a.id)} aria-label="Apagar alerta">
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </Stack>
  );
}
