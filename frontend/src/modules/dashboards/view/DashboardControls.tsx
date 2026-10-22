import { ActionIcon, Button, Group, Menu, Tooltip } from "@mantine/core";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCheck,
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
import { useRef } from "react";

interface DashboardControlsProps {
  editing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isDefault: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddWidget: () => void;
  onToggleEditing: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onShare: () => void;
  onExport: () => void;
  onImportFile: (file: File | undefined) => void;
  onTvMode: () => void;
  onRemove: () => void;
}

/** Right side of the dashboard header: edit controls, the "⋯" menu and the hidden file input for import. */
export function DashboardControls(props: DashboardControlsProps) {
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <Group gap={6}>
      <EditControls
        editing={props.editing}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        onAddWidget={props.onAddWidget}
        onToggleEditing={props.onToggleEditing}
      />
      <Menu position="bottom-end" shadow="md" width={230}>
        <Menu.Target>
          <ActionIcon variant="default" size="lg" aria-label="Menu do painel">
            <IconDots size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPencil size={14} />} onClick={props.onRename}>
            Renomear
          </Menu.Item>
          <Menu.Item leftSection={<IconCopy size={14} />} onClick={props.onDuplicate}>
            Duplicar
          </Menu.Item>
          <Menu.Item
            leftSection={<IconStar size={14} />}
            disabled={props.isDefault}
            onClick={props.onSetDefault}
          >
            Definir como padrão
          </Menu.Item>
          <Menu.Item leftSection={<IconShare size={14} />} onClick={props.onShare}>
            Compartilhar…
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item leftSection={<IconDownload size={14} />} onClick={props.onExport}>
            Exportar JSON
          </Menu.Item>
          <Menu.Item leftSection={<IconFileImport size={14} />} onClick={() => importRef.current?.click()}>
            Importar JSON
          </Menu.Item>
          <Menu.Item leftSection={<IconDeviceTv size={14} />} onClick={props.onTvMode}>
            Modo TV
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={props.onRemove}>
            Apagar painel
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => props.onImportFile(event.currentTarget.files?.[0])}
      />
    </Group>
  );
}

interface EditControlsProps {
  editing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddWidget: () => void;
  onToggleEditing: () => void;
}

/** Undo, redo and add widget (while editing), and the edit/done toggle. */
function EditControls({
  editing,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAddWidget,
  onToggleEditing,
}: EditControlsProps) {
  return (
    <>
      {editing && (
        <>
          <Tooltip label="Desfazer (Ctrl+Z)">
            <ActionIcon
              variant="default"
              size="lg"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Desfazer"
            >
              <IconArrowBackUp size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refazer (Ctrl+Shift+Z)">
            <ActionIcon variant="default" size="lg" onClick={onRedo} disabled={!canRedo} aria-label="Refazer">
              <IconArrowForwardUp size={18} />
            </ActionIcon>
          </Tooltip>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={onAddWidget}>
            Adicionar widget
          </Button>
        </>
      )}
      <Button
        variant={editing ? "filled" : "default"}
        color={editing ? "teal" : undefined}
        leftSection={editing ? <IconCheck size={16} /> : <IconEdit size={16} />}
        onClick={onToggleEditing}
      >
        {editing ? "Concluir" : "Editar painel"}
      </Button>
    </>
  );
}
