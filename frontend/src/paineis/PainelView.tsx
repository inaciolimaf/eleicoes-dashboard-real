import { ActionIcon, Badge, Button, Group, Loader, Menu, Modal, Stack, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCheck,
  IconCloudCheck,
  IconCopy,
  IconDeviceTv,
  IconDots,
  IconDownload,
  IconEdit,
  IconFileImport,
  IconPencil,
  IconPlus,
  IconShare,
  IconStar,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SemDados } from "../components/common/Estados";
import { baixarJson } from "../lib/exportar";
import { slug } from "../lib/format";
import { useFiltro } from "../store/filtro";
import { useTempo } from "../store/tempo";
import { REGISTRO } from "../widgets/registro";
import { CompartilharModal } from "./CompartilharModal";
import { useEditor } from "./editor";
import { GavetaConfig } from "./GavetaConfig";
import { GavetaWidgets } from "./GavetaWidgets";
import { Grade } from "./Grade";
import { lerArquivoPainel } from "./NovoPainelModal";
import { usePaineis, type Painel } from "./repo";
import { SCHEMA_VERSION, novoIdWidget, type ConfigPainel, type LayoutItem, type TipoWidget, type WidgetCfg } from "./schema";

/** Carrega o filtro global do painel na store da aplicação. */
export function aplicarFiltroDoPainel(cfg: ConfigPainel) {
  const f = cfg.filtroGlobal;
  useFiltro.getState().setFiltro({
    ciclo: f.ciclo ?? null,
    turno: f.turno,
    cargo: f.cargo,
    nivel: f.nivel,
    id: f.recorte,
    nome: undefined,
  });
  if (f.tempo && f.tempo !== "agora") useTempo.getState().setT(f.tempo);
}

function mesmaPosicao(a: WidgetCfg[], lg: LayoutItem[]): boolean {
  const m = new Map(lg.map((l) => [l.i, l]));
  return a.every((w) => {
    const l = m.get(w.id);
    return !l || (l.x === w.pos.x && l.y === w.pos.y && l.w === w.pos.w && l.h === w.pos.h);
  });
}

export function PainelView({ painel }: { painel: Painel }) {
  const repo = usePaineis();
  const navigate = useNavigate();
  const ed = useEditor();
  const [configurando, setConfigurando] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState(false);
  const [compartilhar, setCompartilhar] = useState(false);
  const [renomear, setRenomear] = useState<string | null>(null);
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const [salvando, setSalvando] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // carrega no editor e sincroniza o filtro global
  useEffect(() => {
    useEditor.getState().carregar(painel.id, painel.config);
    aplicarFiltroDoPainel(painel.config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painel.id]);

  useEffect(() => () => useEditor.getState().limpar(), []);

  // filtro global → config do painel (sem entrar no histórico)
  useEffect(
    () =>
      useFiltro.subscribe((s) => {
        const e = useEditor.getState();
        if (e.painelId !== painel.id || !e.config) return;
        const fg = e.config.filtroGlobal;
        if (fg.turno === s.turno && fg.cargo === s.cargo && fg.nivel === s.nivel && fg.recorte === s.id && (fg.ciclo ?? null) === s.ciclo) return;
        e.aplicar((c) => ({ ...c, filtroGlobal: { ...c.filtroGlobal, turno: s.turno, cargo: s.cargo, nivel: s.nivel, recorte: s.id, ciclo: s.ciclo } }), { historico: false });
      }),
    [painel.id],
  );

  // salvamento automático (debounce)
  const salvarRef = useRef(repo.salvar);
  salvarRef.current = repo.salvar;
  useEffect(() => {
    if (ed.painelId !== painel.id || !ed.config || ed.versao === 0) return;
    const cfg = ed.config;
    const id = setTimeout(async () => {
      setSalvando(true);
      try {
        await salvarRef.current(painel.id, { config: { ...cfg, schemaVersion: SCHEMA_VERSION } });
        setSalvoEm(new Date());
      } catch (e) {
        notifications.show({ color: "red", title: "Não foi possível salvar o painel", message: (e as Error).message });
      } finally {
        setSalvando(false);
      }
    }, 900);
    return () => clearTimeout(id);
  }, [ed.versao, ed.config, ed.painelId, painel.id]);

  useHotkeys(
    ed.editando
      ? [
          ["mod+Z", () => useEditor.getState().desfazer()],
          ["mod+shift+Z", () => useEditor.getState().refazer()],
          ["mod+Y", () => useEditor.getState().refazer()],
        ]
      : [],
  );

  const config = ed.painelId === painel.id && ed.config ? ed.config : painel.config;
  const widgetConfigurando = useMemo(() => config.widgets.find((w) => w.id === configurando) ?? null, [config.widgets, configurando]);

  const adicionar = (tipo: TipoWidget) => {
    const def = REGISTRO[tipo];
    const y = config.widgets.reduce((m, w) => Math.max(m, w.pos.y + w.pos.h), 0);
    const w: WidgetCfg = { id: novoIdWidget(), tipo, pos: { x: 0, y, w: def.tamanho.w, h: def.tamanho.h }, herda: true, config: { ...def.padrao } };
    ed.aplicar((c) => ({ ...c, widgets: [...c.widgets, w], layouts: undefined }));
    setCatalogo(false);
    notifications.show({ color: "teal", message: `${def.nome} adicionado ao fim do painel`, autoClose: 2500 });
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 250);
  };

  const exportar = () =>
    baixarJson({ formato: "eleicoes-dashboard/painel", schemaVersion: SCHEMA_VERSION, nome: painel.nome, config: { ...config, nome: painel.nome } }, `painel-${slug(painel.nome)}.json`);

  const importar = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { nome, config: c } = lerArquivoPainel(await f.text());
      const p = await repo.criar(nome, c, false);
      notifications.show({ color: "teal", title: "Painel importado", message: p.nome });
      navigate(`/paineis/${p.id}`);
    } catch (e) {
      notifications.show({ color: "red", title: "Falha ao importar", message: (e as Error).message });
    }
  };

  const apagar = () =>
    modals.openConfirmModal({
      title: "Apagar painel",
      children: <Text size="sm">Apagar “{painel.nome}”? Essa ação não pode ser desfeita.</Text>,
      labels: { confirm: "Apagar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await repo.apagar(painel.id);
        navigate("/paineis");
      },
    });

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <Title order={3} lineClamp={1}>
            {painel.nome}
          </Title>
          {painel.padrao && (
            <Tooltip label="Painel padrão (abre na página inicial)">
              <IconStar size={16} fill="var(--mantine-color-yellow-5)" color="var(--mantine-color-yellow-5)" />
            </Tooltip>
          )}
          <Badge variant="light" color={painel.remoto ? "teal" : "gray"} size="sm">
            {painel.remoto ? "na conta" : "neste navegador"}
          </Badge>
          {salvando ? (
            <Loader size={14} />
          ) : salvoEm ? (
            <Tooltip label={`Salvo às ${salvoEm.toLocaleTimeString("pt-BR")}`}>
              <IconCloudCheck size={16} color="var(--mantine-color-teal-5)" />
            </Tooltip>
          ) : null}
        </Group>
        <Group gap={6}>
          {ed.editando && (
            <>
              <Tooltip label="Desfazer (Ctrl+Z)">
                <ActionIcon variant="default" size="lg" onClick={ed.desfazer} disabled={!ed.passado.length} aria-label="Desfazer">
                  <IconArrowBackUp size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Refazer (Ctrl+Shift+Z)">
                <ActionIcon variant="default" size="lg" onClick={ed.refazer} disabled={!ed.futuro.length} aria-label="Refazer">
                  <IconArrowForwardUp size={18} />
                </ActionIcon>
              </Tooltip>
              <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setCatalogo(true)}>
                Adicionar widget
              </Button>
            </>
          )}
          <Button
            variant={ed.editando ? "filled" : "default"}
            color={ed.editando ? "teal" : undefined}
            leftSection={ed.editando ? <IconCheck size={16} /> : <IconEdit size={16} />}
            onClick={() => ed.setEditando(!ed.editando)}
          >
            {ed.editando ? "Concluir" : "Editar painel"}
          </Button>
          <Menu position="bottom-end" shadow="md" width={230}>
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="Menu do painel">
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setRenomear(painel.nome)}>
                Renomear
              </Menu.Item>
              <Menu.Item
                leftSection={<IconCopy size={14} />}
                onClick={async () => {
                  const p = await repo.criar(`${painel.nome} (cópia)`, config, false);
                  navigate(`/paineis/${p.id}`);
                }}
              >
                Duplicar
              </Menu.Item>
              <Menu.Item leftSection={<IconStar size={14} />} disabled={painel.padrao} onClick={() => repo.definirPadrao(painel.id)}>
                Definir como padrão
              </Menu.Item>
              <Menu.Item leftSection={<IconShare size={14} />} onClick={() => setCompartilhar(true)}>
                Compartilhar…
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<IconDownload size={14} />} onClick={exportar}>
                Exportar JSON
              </Menu.Item>
              <Menu.Item leftSection={<IconFileImport size={14} />} onClick={() => importRef.current?.click()}>
                Importar JSON
              </Menu.Item>
              <Menu.Item leftSection={<IconDeviceTv size={14} />} onClick={() => navigate(`/tv?inicio=${encodeURIComponent(painel.id)}`)}>
                Modo TV
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={apagar}>
                Apagar painel
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => importar(e.currentTarget.files?.[0])} />
        </Group>
      </Group>

      {config.widgets.length === 0 ? (
        <SemDados titulo="Painel vazio">
          <Stack align="center" gap="xs">
            <span>Adicione widgets do catálogo para montar o seu painel.</span>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                ed.setEditando(true);
                setCatalogo(true);
              }}
            >
              Adicionar widget
            </Button>
          </Stack>
        </SemDados>
      ) : (
        <Grade
          config={config}
          editando={ed.editando}
          onLayout={(lg, outros) =>
            ed.aplicar(
              (c) => {
              const mudouLg = !mesmaPosicao(c.widgets, lg);
              const mudouOutros = JSON.stringify(c.layouts ?? {}) !== JSON.stringify({ ...(c.layouts ?? {}), ...outros });
              if (!mudouLg && !mudouOutros) return c;
              const m = new Map(lg.map((l) => [l.i, l]));
              return {
                ...c,
                widgets: c.widgets.map((w) => {
                  const l = m.get(w.id);
                  return l ? { ...w, pos: { x: l.x, y: l.y, w: l.w, h: l.h } } : w;
                }),
                layouts: { ...(c.layouts ?? {}), ...outros },
              };
              },
              { historico: !mesmaPosicao(config.widgets, lg) },
            )
          }
          onConfigurar={setConfigurando}
          onDuplicar={(id) =>
            ed.aplicar((c) => {
              const w = c.widgets.find((x) => x.id === id);
              if (!w) return c;
              const y = c.widgets.reduce((m, x) => Math.max(m, x.pos.y + x.pos.h), 0);
              return { ...c, widgets: [...c.widgets, { ...w, id: novoIdWidget(), pos: { ...w.pos, x: 0, y } }], layouts: undefined };
            })
          }
          onRemover={(id) => ed.aplicar((c) => ({ ...c, widgets: c.widgets.filter((w) => w.id !== id), layouts: undefined }))}
        />
      )}

      <GavetaWidgets aberta={catalogo} onClose={() => setCatalogo(false)} onAdicionar={adicionar} />
      <GavetaConfig
        widget={widgetConfigurando}
        onClose={() => setConfigurando(null)}
        onSalvar={(nw) => ed.aplicar((c) => ({ ...c, widgets: c.widgets.map((w) => (w.id === nw.id ? nw : w)) }))}
      />
      <CompartilharModal painel={painel} aberto={compartilhar} onClose={() => setCompartilhar(false)} />
      <Modal opened={renomear !== null} onClose={() => setRenomear(null)} title="Renomear painel">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (renomear?.trim()) await repo.salvar(painel.id, { nome: renomear.trim() });
            setRenomear(null);
          }}
        >
          <Stack>
            <TextInput value={renomear ?? ""} onChange={(e) => setRenomear(e.currentTarget.value)} data-autofocus maxLength={120} />
            <Group justify="flex-end">
              <Button type="submit">Salvar</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
