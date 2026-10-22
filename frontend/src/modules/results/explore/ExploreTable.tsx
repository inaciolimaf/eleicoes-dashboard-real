import { Button, Menu } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import type { Level } from "../../../api/models";
import { exportData } from "../../../lib/export";
import { LEVEL_PLURAL_LABELS, childLevel as childLevelOf } from "../../../lib/geo-areas";
import { GeoAreaTable, type ColumnId } from "../geo-area-table/GeoAreaTable";
import { ExploreBlock } from "./ExploreBlock";
import type { ExploreState } from "./useExploreState";

/** Columns of the areas table: the country's list, the proportional offices and the majority ones differ. */
function tableColumns(level: Level, allMunicipalities: boolean, proportional: boolean): ColumnId[] {
  if (level === "country" && !allMunicipalities)
    return [
      "nome",
      "regiao",
      "pct_secoes",
      "lider",
      "segundo",
      "margem_pp",
      "votos_validos",
      "eleitorado",
      "comparecimento",
    ];
  if (proportional)
    return ["nome", "pct_secoes", "lider", "partido", "votos_validos", "eleitorado", "abstencao"];
  return [
    "nome",
    "pct_secoes",
    "lider",
    "segundo",
    "margem_pp",
    "votos_validos",
    "eleitorado",
    "capital",
    "abstencao",
  ];
}

function ChildrenExportMenu({ state, level, id }: { state: ExploreState; level: Level; id: string }) {
  const exportArgs = { ...state.filter, nivel: level, id, childLevel: state.childrenParam };
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="xs" variant="default" leftSection={<IconDownload size={14} />}>
          Exportar
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => exportData("children", "csv", exportArgs)}>CSV</Menu.Item>
        <Menu.Item onClick={() => exportData("children", "json", exportArgs)}>JSON</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** Table of the areas inside the one on screen (its children), with the export menu. */
export function ExploreTable({ state, level, id }: { state: ExploreState; level: Level; id: string }) {
  const childLevel = childLevelOf(level);
  if (!childLevel) return null;
  const listedLevel = level === "country" && state.allMunicipalities ? "municipality" : childLevel;
  return (
    <ExploreBlock
      title={`${LEVEL_PLURAL_LABELS[listedLevel]} de ${state.name}`}
      extra={<ChildrenExportMenu state={state} level={level} id={id} />}
    >
      <GeoAreaTable
        level={level}
        id={id}
        childLevel={state.childrenParam}
        columns={tableColumns(level, state.allMunicipalities, state.proportional)}
        onSelect={state.openArea}
      />
    </ExploreBlock>
  );
}
