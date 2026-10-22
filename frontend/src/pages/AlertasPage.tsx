import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBell, IconBellRinging, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useAlertas, useApagarAlerta, useSalvarAlerta } from "../api/hooks";
import type { AlertDto, AlertType } from "../api/models";
import { CandidatoPicker, RecortePicker, lerRecorte, valorRecorte } from "../components/common/Pickers";
import { Carregando, ErroView, SemDados } from "../components/common/Estados";
import { NOME_CARGO, OPCOES_CARGO } from "../lib/cargos";
import { nomeRecortePadrao, ufDoId } from "../lib/recortes";
import { fmtDataCurta } from "../lib/time";
import { useAuth } from "../store/auth";
import { useFiltro } from "../store/filtro";
import { usePrefs } from "../store/prefs";
import { useUi } from "../store/ui";
import type { Level } from "../api/models";

const TIPOS: { value: AlertType; label: string }[] = [
  { value: "candidate_pct", label: "Quando um candidato passar de X%" },
  { value: "lead_change", label: "Quando houver virada em um recorte" },
  { value: "tally_threshold", label: "Quando a apuração chegar a N%" },
  { value: "elected", label: "Quando o candidato for eleito" },
  { value: "polling_place_tallied", label: "Quando um local de votação for apurado" },
];

function descrever(a: AlertDto): string {
  const p = a.params as Record<string, string | number | undefined>;
  const onde = p.level && p.geo_area_id ? nomeRecortePadrao(p.level as Level, String(p.geo_area_id)) : "";
  switch (a.type) {
    case "candidate_pct":
      return `Candidato ${p.tse_candidate_id} passar de ${p.threshold}% (${NOME_CARGO[Number(p.office_code)] ?? ""}${onde ? ` · ${onde}` : ""})`;
    case "lead_change":
      return `Virada em ${onde || "—"} (${NOME_CARGO[Number(p.office_code)] ?? ""})`;
    case "tally_threshold":
      return `Apuração de ${onde || "—"} chegar a ${p.threshold}%`;
    case "elected":
      return `Candidato ${p.tse_candidate_id} ser eleito`;
    case "polling_place_tallied":
      return `Local ${p.polling_place_id} ser 100% apurado`;
  }
  return a.type;
}

function NovoAlerta() {
  const f = useFiltro();
  const salvar = useSalvarAlerta();
  const [tipo, setTipo] = useState<AlertType>("candidate_pct");
  const [cargo, setCargo] = useState(f.cargo);
  const [recorte, setRecorte] = useState<string | null>(valorRecorte(f.nivel, f.id));
  const [sq, setSq] = useState<string | null>(null);
  const [limite, setLimite] = useState<number>(50);
  const [local, setLocal] = useState<string | null>(null);
  const r = lerRecorte(recorte);
  const precisa = {
    cargo: tipo === "candidate_pct" || tipo === "lead_change" || tipo === "elected",
    recorte: tipo === "candidate_pct" || tipo === "lead_change" || tipo === "tally_threshold",
    candidato: tipo === "candidate_pct" || tipo === "elected",
    limite: tipo === "candidate_pct" || tipo === "tally_threshold",
    local: tipo === "polling_place_tallied",
  };
  const criar = async () => {
    const params: Record<string, unknown> = {};
    if (tipo === "candidate_pct")
      Object.assign(params, {
        office_code: cargo,
        level: r?.nivel,
        geo_area_id: r?.id,
        tse_candidate_id: sq,
        threshold: limite,
      });
    if (tipo === "lead_change")
      Object.assign(params, { office_code: cargo, level: r?.nivel, geo_area_id: r?.id });
    if (tipo === "tally_threshold")
      Object.assign(params, { level: r?.nivel, geo_area_id: r?.id, threshold: limite });
    if (tipo === "elected") Object.assign(params, { tse_candidate_id: sq });
    if (tipo === "polling_place_tallied") Object.assign(params, { polling_place_id: lerRecorte(local)?.id });
    if (Object.values(params).some((v) => v === undefined || v === null)) {
      notifications.show({ color: "red", message: "Preencha todos os campos do alerta." });
      return;
    }
    try {
      await salvar.mutateAsync({ type: tipo, params, active: true });
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
        <Select
          label="Regra"
          data={TIPOS}
          value={tipo}
          onChange={(v) => v && setTipo(v as AlertType)}
          allowDeselect={false}
        />
        <Group grow align="flex-start">
          {precisa.cargo && (
            <Select
              label="Cargo"
              data={OPCOES_CARGO.map((o) => ({ value: o.valor, label: o.rotulo }))}
              value={String(cargo === 8 ? 7 : cargo)}
              onChange={(v) => setCargo(Number(v ?? 1))}
              allowDeselect={false}
            />
          )}
          {precisa.recorte && (
            <RecortePicker label="Recorte" value={recorte} onChange={(v) => setRecorte(v)} />
          )}
        </Group>
        <Group grow align="flex-start">
          {precisa.candidato && (
            <CandidatoPicker
              label="Candidato"
              value={sq}
              onChange={setSq}
              turno={f.turno}
              cargo={cargo}
              uf={r ? ufDoId(r.nivel, r.id) : null}
            />
          )}
          {precisa.limite && (
            <NumberInput
              label="Limite (%)"
              value={limite}
              onChange={(v) => setLimite(Number(v) || 0)}
              min={0}
              max={100}
              decimalScale={2}
            />
          )}
        </Group>
        {precisa.local && (
          <RecortePicker
            label="Local de votação"
            tipos={["polling_place"]}
            incluirBrasil={false}
            incluirUfs={false}
            value={local}
            onChange={(v) => setLocal(v)}
          />
        )}
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
    if (r === "granted")
      new Notification("Notificações ativadas", {
        body: "Você receberá os alertas da apuração.",
        icon: "/favicon.svg",
      });
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
            <Switch
              label="Ativo"
              checked={push}
              onChange={(e) => setPrefs({ push: e.currentTarget.checked })}
            />
          ) : (
            <Button
              leftSection={<IconBell size={16} />}
              onClick={ativarPush}
              disabled={permissao === "denied"}
            >
              {permissao === "denied" ? "Bloqueado no navegador" : "Permitir notificações"}
            </Button>
          )}
        </Group>
      </Card>
      {!logado ? (
        <Alert variant="light" color="blue" title="Entre para criar alertas">
          <Group justify="space-between">
            <Text size="sm">
              As regras de alerta ficam na sua conta e são avaliadas pelo servidor durante a apuração.
            </Text>
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
                            {TIPOS.find((t) => t.value === a.type)?.label ?? a.type}
                          </Badge>
                          <Text size="sm">{descrever(a)}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" className="num">
                          {a.triggered_at ? fmtDataCurta(a.triggered_at) : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          checked={a.active}
                          onChange={(e) => salvar.mutate({ ...a, active: e.currentTarget.checked })}
                          aria-label="Ativo"
                        />
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="Apagar">
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            onClick={() => apagar.mutate(a.id)}
                            aria-label="Apagar alerta"
                          >
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
