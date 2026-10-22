import { ActionIcon, Box, Group, Select, Switch, Tooltip } from "@mantine/core";
import { IconMaximize } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import type { Level } from "../../../api/models";
import { ElectoralMap, type MapType } from "../../maps";
import { ExploreBlock } from "./ExploreBlock";
import type { ExploreState } from "./useExploreState";

/** What the map card lists, by the level of the area on screen. */
function mapScopeLabel(level: Level, allMunicipalities: boolean): string {
  if (level === "country") return allMunicipalities ? "municípios" : "UFs";
  if (level === "state") return "municípios";
  return "locais de votação";
}

function MapControls({ state, level }: { state: ExploreState; level: Level }) {
  const navigate = useNavigate();
  return (
    <Group gap="xs">
      {level === "country" && (
        <Switch
          size="xs"
          label="Todos os municípios"
          checked={state.allMunicipalities}
          onChange={(event) => state.setAllMunicipalities(event.currentTarget.checked)}
        />
      )}
      <Select
        size="xs"
        w={190}
        data={state.mapTypes.map((type) => ({ value: type.valor, label: type.rotulo }))}
        value={state.mapType}
        onChange={(value) => value && state.setMapType(value as MapType)}
        allowDeselect={false}
        aria-label="Tipo de mapa"
      />
      <Tooltip label="Abrir em tela cheia">
        <ActionIcon
          variant="default"
          onClick={() => navigate(`/mapas?tipo=${state.mapType}${state.allMunicipalities ? "&mun=1" : ""}`)}
          aria-label="Mapa em tela cheia"
        >
          <IconMaximize size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

/** Map card of the explore screen: the areas of the level, colored by the chosen map type. */
export function ExploreMap({ state, level, id }: { state: ExploreState; level: Level; id: string }) {
  return (
    <ExploreBlock
      title={`Mapa · ${mapScopeLabel(level, state.allMunicipalities)}`}
      extra={<MapControls state={state} level={level} />}
    >
      <Box h={{ base: 380, md: 520 }} style={{ borderRadius: 12, overflow: "hidden" }}>
        <ElectoralMap
          tipo={state.mapType}
          nivel={level}
          id={id}
          todosMunicipios={state.allMunicipalities}
          onSelecionar={state.openArea}
        />
      </Box>
    </ExploreBlock>
  );
}
