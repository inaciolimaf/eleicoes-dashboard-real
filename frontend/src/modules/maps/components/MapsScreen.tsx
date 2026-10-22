import { Badge, Box, Button, Card, Drawer, Group, ScrollArea, ThemeIcon, Text } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconAdjustments } from "@tabler/icons-react";
import { useMemo, type ReactNode } from "react";
import { useNavigate, type SetURLSearchParams } from "react-router-dom";
import type { Level } from "../../../api/models";
import { asLevel, defaultGeoAreaName, geoAreaLink, zoneOfId } from "../../../lib/geo-areas";
import { useEffectiveFilter } from "../../../lib/effective-filter";
import { useFilter } from "../../../lib/filter-store";
import { defaultSystem } from "../../../lib/offices";
import { usePrefs } from "../../../lib/prefs-store";
import { useOfficeWithoutBrResult, useResults } from "../../results";
import { MAP_TYPES, type MapType } from "../types";
import { ElectoralMap } from "./ElectoralMap";
import { MapSidePanel } from "./MapSidePanel";

/** Phone layout: the side panel opens from a button at the bottom right. */
function PhoneDrawer({
  opened,
  onOpen,
  onClose,
  typeLabel,
  level,
  children,
}: {
  opened: boolean;
  onOpen: () => void;
  onClose: () => void;
  typeLabel: string | undefined;
  level: Level;
  children: ReactNode;
}) {
  return (
    <>
      <Button
        leftSection={<IconAdjustments size={16} />}
        onClick={onOpen}
        style={{ position: "absolute", bottom: 12, right: 12, zIndex: 20 }}
        radius="xl"
        size="sm"
        variant="filled"
      >
        {typeLabel}
      </Button>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="bottom"
        size="75%"
        title={
          <Group gap={6}>
            <ThemeIcon size="sm" variant="light">
              <IconAdjustments size={14} />
            </ThemeIcon>
            <Text fw={700}>Mapa</Text>
            <Badge size="xs">{level}</Badge>
          </Group>
        }
      >
        {children}
      </Drawer>
    </>
  );
}

/** Maps screen (`/mapas`): the full-height map with the kind selector and the side panel (a drawer on phones). */
export function MapsScreen({ sp, setSp }: { sp: URLSearchParams; setSp: SetURLSearchParams }) {
  const filter = useEffectiveFilter();
  const globalFilter = useFilter();
  const navigate = useNavigate();
  const basemap = usePrefs((s) => s.basemap);
  const setPrefs = usePrefs((s) => s.set);
  const phone = useMediaQuery("(max-width: 62em)");
  const [panelOpen, { open, close }] = useDisclosure(false);
  const type = (sp.get("tipo") as MapType) || "vencedores";
  const allMunicipalities = sp.get("mun") === "1";
  const noBrResult = useOfficeWithoutBrResult(filter.cargo, filter.nivel);
  const results = useResults(
    { turno: filter.turno, cargo: filter.cargo, nivel: filter.nivel, id: filter.id, t: filter.t },
    !noBrResult,
  );
  const proportional = (results.data?.office.voting_system ?? defaultSystem(filter.cargo)) === "proporcional";
  const mapLevel: Level = filter.nivel === "section" ? "zone" : filter.nivel;
  const mapId = filter.nivel === "section" ? (zoneOfId("section", filter.id) ?? filter.id) : filter.id;
  const breadcrumb = results.data?.geo_area.breadcrumb;
  const parent = breadcrumb?.[breadcrumb.length - 2];
  const types = useMemo(() => MAP_TYPES.filter((t) => !t.proporcional || proportional), [proportional]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSp(next, { replace: true });
  };

  const selectArea = (level: Level, id: string, name: string) => {
    if (level === "polling_place" || level === "section") navigate(geoAreaLink(level, id));
    else globalFilter.setRecorte(level, id, name);
  };

  const panel = (
    <MapSidePanel
      results={results.data}
      fallbackName={globalFilter.nome ?? defaultGeoAreaName(filter.nivel, filter.id)}
      type={type}
      types={types}
      onTypeChange={(value) => setParam("tipo", value)}
      atCountry={filter.nivel === "country"}
      allMunicipalities={allMunicipalities}
      onAllMunicipalitiesChange={(on) => setParam("mun", on ? "1" : null)}
      basemap={basemap}
      onBasemapChange={(on) => setPrefs({ basemap: on })}
      noBrResult={noBrResult}
      parent={parent}
      onUp={(up) => globalFilter.setRecorte(asLevel(up.level), up.id, up.name)}
      onExplore={() => navigate(geoAreaLink(filter.nivel, filter.id))}
    />
  );

  return (
    <Box pos="relative" style={{ height: "calc(100dvh - 60px - 64px - 46px - 32px)", minHeight: 420 }}>
      <Group gap="md" h="100%" wrap="nowrap" align="stretch">
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <ElectoralMap
            tipo={type}
            nivel={mapLevel}
            id={mapId}
            todosMunicipios={allMunicipalities}
            onSelecionar={selectArea}
            altura="100%"
          />
        </Box>
        {!phone && (
          <Card w={330} p="sm" style={{ flexShrink: 0 }}>
            <ScrollArea h="100%" className="scroll-fino">
              {panel}
            </ScrollArea>
          </Card>
        )}
      </Group>
      {phone && (
        <PhoneDrawer
          opened={panelOpen}
          onOpen={open}
          onClose={close}
          typeLabel={MAP_TYPES.find((t) => t.valor === type)?.rotulo}
          level={filter.nivel}
        >
          {panel}
        </PhoneDrawer>
      )}
    </Box>
  );
}
