import { ActionIcon, Menu } from "@mantine/core";
import {
  IconCopy,
  IconDots,
  IconFileTypeCsv,
  IconJson,
  IconPhoto,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import type { RefObject } from "react";
import type { Level } from "../../../api/models";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { exportData, exportPng } from "../../../lib/export";
import type { WidgetCfg } from "../schema";
import { REGISTRY } from "../widgets/registry";

interface WidgetMenuProps {
  widget: WidgetCfg;
  title: string;
  cardRef: RefObject<HTMLDivElement>;
  editing: boolean;
  onConfigure?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
}

/** The widget's "⋯" menu: configure, duplicate, export (CSV, JSON, PNG) and remove. */
export function WidgetMenu({
  widget,
  title,
  cardRef,
  editing,
  onConfigure,
  onDuplicate,
  onRemove,
}: WidgetMenuProps) {
  const filter = useEffectiveFilter();
  const definition = REGISTRY[widget.tipo];
  const children =
    widget.config?.nivelFilhos === "municipio" && filter.nivel === "country"
      ? ("municipality" as Level)
      : null;
  const exportKind = definition.exportKind;
  return (
    <Menu position="bottom-end" withinPortal shadow="md" width={210}>
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label="Opções do widget">
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {onConfigure && (
          <Menu.Item leftSection={<IconSettings size={14} />} onClick={onConfigure}>
            Configurar
          </Menu.Item>
        )}
        {onDuplicate && editing && (
          <Menu.Item leftSection={<IconCopy size={14} />} onClick={onDuplicate}>
            Duplicar
          </Menu.Item>
        )}
        <Menu.Label>Exportar</Menu.Label>
        {exportKind && (
          <>
            <Menu.Item
              leftSection={<IconFileTypeCsv size={14} />}
              onClick={() => exportData(exportKind, "csv", { ...filter, childLevel: children })}
            >
              Dados (CSV)
            </Menu.Item>
            <Menu.Item
              leftSection={<IconJson size={14} />}
              onClick={() => exportData(exportKind, "json", { ...filter, childLevel: children })}
            >
              Dados (JSON)
            </Menu.Item>
          </>
        )}
        <Menu.Item leftSection={<IconPhoto size={14} />} onClick={() => exportPng(cardRef.current, title)}>
          Imagem (PNG)
        </Menu.Item>
        {onRemove && editing && (
          <>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onRemove}>
              Remover
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
