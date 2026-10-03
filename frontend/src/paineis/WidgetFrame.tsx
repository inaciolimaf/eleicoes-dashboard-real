import { ActionIcon, Badge, Box, Button, Card, Group, Menu, Stack, Text, Tooltip } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconClockHour4,
  IconCopy,
  IconDots,
  IconFileTypeCsv,
  IconGripVertical,
  IconJson,
  IconLock,
  IconMapPin,
  IconPhoto,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { Component, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Nivel } from "../api/types";
import { FiltroProvider, useFiltroEfetivo, type FiltroParcial } from "../lib/filtro-efetivo";
import { exportarDados, exportarPng } from "../lib/exportar";
import { linkRecorte, nomeRecortePadrao } from "../lib/recortes";
import { NOME_CARGO } from "../lib/cargos";
import { fmtDataCurta } from "../lib/time";
import { useFiltro } from "../store/filtro";
import { REGISTRO } from "../widgets/registro";
import type { WidgetCfg } from "./schema";

class LimiteErro extends Component<{ children: ReactNode; chave: string }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }
  componentDidUpdate(prev: { chave: string }) {
    if (prev.chave !== this.props.chave && this.state.erro) this.setState({ erro: null });
  }
  render() {
    if (this.state.erro)
      return (
        <Stack align="center" gap={6} p="md">
          <IconAlertTriangle color="var(--mantine-color-red-5)" />
          <Text size="sm" ta="center">
            Este widget encontrou um erro.
          </Text>
          <Text size="xs" c="dimmed" ta="center" lineClamp={3}>
            {this.state.erro.message}
          </Text>
          <Button size="compact-xs" variant="light" onClick={() => this.setState({ erro: null })}>
            Recarregar widget
          </Button>
        </Stack>
      );
    return this.props.children;
  }
}

/** Filtro fixado do widget → sobrescrita do contexto */
export function filtroDoWidget(w: WidgetCfg): FiltroParcial | null {
  if (w.herda || !w.filtros) return null;
  const f = w.filtros;
  const p: FiltroParcial = {};
  if (f.turno) p.turno = f.turno;
  if (f.cargo) p.cargo = f.cargo;
  if (f.nivel && f.recorte) {
    p.nivel = f.nivel;
    p.id = f.recorte;
  }
  if (f.tempo) {
    p.t = f.tempo === "agora" ? null : f.tempo;
    p.tFixo = f.tempo !== "agora";
  }
  return p;
}

function Chips({ fixado }: { fixado: boolean }) {
  const f = useFiltroEfetivo();
  const nomeGlobal = useFiltro((s) => s.nome);
  const g = useFiltro();
  const nome = !fixado && g.nivel === f.nivel && g.id === f.id ? nomeGlobal ?? nomeRecortePadrao(f.nivel, f.id) : nomeRecortePadrao(f.nivel, f.id);
  return (
    <Group gap={4} wrap="nowrap" visibleFrom="xs" style={{ overflow: "hidden" }}>
      <Tooltip label={`${NOME_CARGO[f.cargo] ?? ""} · ${f.turno}º turno`}>
        <Badge size="xs" variant="light" color="gray" leftSection={<IconMapPin size={10} />} style={{ maxWidth: 160 }}>
          {nome}
        </Badge>
      </Tooltip>
      {f.t && (
        <Badge size="xs" variant="light" color="yellow" leftSection={<IconClockHour4 size={10} />}>
          {fmtDataCurta(f.t)}
        </Badge>
      )}
      {fixado && (
        <Tooltip label="Este widget tem filtro próprio (não herda o filtro do painel)">
          <IconLock size={13} color="var(--mantine-color-yellow-5)" />
        </Tooltip>
      )}
    </Group>
  );
}

interface Props {
  widget: WidgetCfg;
  editando: boolean;
  somenteLeitura?: boolean;
  onConfigurar?: () => void;
  onDuplicar?: () => void;
  onRemover?: () => void;
}

export function WidgetFrame({ widget, editando, somenteLeitura, onConfigurar, onDuplicar, onRemover }: Props) {
  const def = REGISTRO[widget.tipo];
  const cfg = useMemo(() => ({ ...def.padrao, ...widget.config }), [def.padrao, widget.config]);
  const titulo = (typeof cfg.titulo === "string" && cfg.titulo) || def.nome;
  const { ref, height } = useElementSize();
  const cardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const setRecorte = useFiltro((s) => s.setRecorte);
  const fixo = filtroDoWidget(widget);

  const selecionar = useCallback(
    (nivel: Nivel, id: string, nome: string) => {
      const clique = cfg.clique === "navegar" ? "navegar" : "filtrar";
      if (nivel === "local" || nivel === "secao" || clique === "navegar" || fixo) navigate(linkRecorte(nivel, id));
      else setRecorte(nivel, id, nome);
    },
    [cfg.clique, fixo, navigate, setRecorte],
  );

  const Comp = def.Componente;
  const corpo = (
    <Box ref={ref} style={{ flex: 1, minHeight: 0, position: "relative" }}>
      {height > 0 && (
        <LimiteErro chave={JSON.stringify(widget.config) + JSON.stringify(widget.filtros)}>
          <Comp widget={widget} cfg={cfg} altura={Math.floor(height)} selecionar={selecionar} />
        </LimiteErro>
      )}
    </Box>
  );

  const menu = (
    <ExportMenu
      widget={widget}
      titulo={titulo}
      cardRef={cardRef}
      editando={editando && !somenteLeitura}
      onConfigurar={onConfigurar}
      onDuplicar={onDuplicar}
      onRemover={onRemover}
    />
  );

  const conteudo = (
    <Card
      ref={cardRef}
      p="sm"
      h="100%"
      style={{
        display: "flex",
        flexDirection: "column",
        outline: editando ? "1px dashed var(--mantine-color-eleicao-4)" : undefined,
        overflow: "hidden",
      }}
      aria-label={titulo}
    >
      <Group justify="space-between" wrap="nowrap" gap={6} mb={6} style={{ flexShrink: 0 }}>
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
          {editando && !somenteLeitura && (
            <Box className="alca-arrastar" style={{ display: "flex" }} aria-label="Arrastar widget">
              <IconGripVertical size={16} color="var(--mantine-color-dimmed)" />
            </Box>
          )}
          <Text fw={700} size="sm" lineClamp={1} className={editando ? "alca-arrastar" : undefined}>
            {titulo}
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap" data-export-ignore="true">
          <Chips fixado={!!fixo} />
          {menu}
        </Group>
      </Group>
      {corpo}
    </Card>
  );
  return fixo ? <FiltroProvider value={fixo}>{conteudo}</FiltroProvider> : conteudo;
}

function ExportMenu({
  widget,
  titulo,
  cardRef,
  editando,
  onConfigurar,
  onDuplicar,
  onRemover,
}: {
  widget: WidgetCfg;
  titulo: string;
  cardRef: React.RefObject<HTMLDivElement>;
  editando: boolean;
  onConfigurar?: () => void;
  onDuplicar?: () => void;
  onRemover?: () => void;
}) {
  const f = useFiltroEfetivo();
  const def = REGISTRO[widget.tipo];
  const filhos = widget.config?.nivelFilhos === "municipio" && f.nivel === "br" ? ("municipio" as Nivel) : null;
  return (
    <Menu position="bottom-end" withinPortal shadow="md" width={210}>
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label="Opções do widget">
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {onConfigurar && (
          <Menu.Item leftSection={<IconSettings size={14} />} onClick={onConfigurar}>
            Configurar
          </Menu.Item>
        )}
        {onDuplicar && editando && (
          <Menu.Item leftSection={<IconCopy size={14} />} onClick={onDuplicar}>
            Duplicar
          </Menu.Item>
        )}
        <Menu.Label>Exportar</Menu.Label>
        {def.exporta && (
          <>
            <Menu.Item leftSection={<IconFileTypeCsv size={14} />} onClick={() => exportarDados(def.exporta!, "csv", { ...f, filhos })}>
              Dados (CSV)
            </Menu.Item>
            <Menu.Item leftSection={<IconJson size={14} />} onClick={() => exportarDados(def.exporta!, "json", { ...f, filhos })}>
              Dados (JSON)
            </Menu.Item>
          </>
        )}
        <Menu.Item leftSection={<IconPhoto size={14} />} onClick={() => exportarPng(cardRef.current, titulo)}>
          Imagem (PNG)
        </Menu.Item>
        {onRemover && editando && (
          <>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onRemover}>
              Remover
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
