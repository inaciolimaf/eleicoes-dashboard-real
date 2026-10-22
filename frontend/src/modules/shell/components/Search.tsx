import { Spotlight, spotlight, type SpotlightActionGroupData } from "@mantine/spotlight";
import { Button, Kbd, Loader, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconBox,
  IconBuildingCommunity,
  IconMap,
  IconMapPin,
  IconSchool,
  IconSearch,
  IconUser,
  type Icon,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../hooks";
import type { Level, SearchItemDto, SearchType } from "../../../api/models";
import { geoAreaLink } from "../../../lib/geo-areas";
import { officeForState } from "../../../lib/offices";
import { useFilter } from "../../../lib/filter-store";

/** Search results are grouped in this order, each group with its label and icon. */
const GROUPS: Record<SearchType, { label: string; icon: Icon }> = {
  candidate: { label: "Candidatos", icon: IconUser },
  state: { label: "UFs", icon: IconMap },
  municipality: { label: "Municípios", icon: IconBuildingCommunity },
  zone: { label: "Zonas", icon: IconMapPin },
  polling_place: { label: "Locais de votação", icon: IconSchool },
  section: { label: "Seções", icon: IconBox },
};
const DEBOUNCE_MS = 220;
const MIN_QUERY_LENGTH = 2;

/** Global search (Ctrl+K) over the search API. */
export function Search() {
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, DEBOUNCE_MS);
  const results = useSearch(debouncedQuery);
  const navigate = useNavigate();

  const openHit = useCallback(
    (hit: SearchItemDto) => {
      if (hit.type === "candidate") {
        if (hit.office_code)
          useFilter
            .getState()
            .setFiltro({ cargo: officeForState(Number(hit.office_code), hit.state_code ?? null) });
        navigate(`/candidatos/${encodeURIComponent(hit.id)}`);
        return;
      }
      const level = (hit.level ?? hit.type) as Level;
      if (level !== "polling_place" && level !== "section")
        useFilter.getState().setGeoArea(level, hit.id, hit.title);
      navigate(geoAreaLink(level, hit.id));
    },
    [navigate],
  );

  const actions = useMemo<SpotlightActionGroupData[]>(() => {
    const hitsByType = new Map<SearchType, SearchItemDto[]>();
    for (const hit of results.data?.items ?? []) {
      const list = hitsByType.get(hit.type as SearchType);
      if (list) list.push(hit);
      else hitsByType.set(hit.type as SearchType, [hit]);
    }
    return (Object.keys(GROUPS) as SearchType[])
      .filter((type) => hitsByType.has(type))
      .map((type) => {
        const group = GROUPS[type];
        return {
          group: group.label,
          actions: hitsByType.get(type)!.map((hit) => ({
            id: `${hit.type}:${hit.id}`,
            label: hit.title,
            description: hit.subtitle ?? undefined,
            leftSection: <group.icon size={20} stroke={1.6} />,
            onClick: () => openHit(hit),
          })),
        };
      });
  }, [results.data, openHit]);

  return (
    <>
      <Button
        variant="default"
        size="sm"
        leftSection={<IconSearch size={16} />}
        rightSection={<Kbd size="xs">Ctrl K</Kbd>}
        onClick={spotlight.open}
        visibleFrom="lg"
        styles={{
          inner: { justifyContent: "space-between" },
          label: { fontWeight: 400, color: "var(--mantine-color-dimmed)" },
        }}
        w={170}
      >
        Buscar…
      </Button>
      <Button variant="default" size="sm" px={8} onClick={spotlight.open} hiddenFrom="lg" aria-label="Buscar">
        <IconSearch size={16} />
      </Button>
      <Spotlight
        actions={actions}
        query={query}
        onQueryChange={setQuery}
        filter={(_q, items) => items}
        shortcut={["mod + K", "/"]}
        nothingFound={
          debouncedQuery.trim().length < MIN_QUERY_LENGTH ? (
            <Text size="sm" c="dimmed">
              Município, zona (“zona 1 SP”), seção, escola, bairro, candidato (nome ou número) ou partido
            </Text>
          ) : results.isFetching ? (
            <Loader size="sm" />
          ) : (
            "Nada encontrado"
          )
        }
        highlightQuery
        scrollable
        maxHeight={460}
        searchProps={{
          leftSection: results.isFetching ? <Loader size={16} /> : <IconSearch size={18} />,
          placeholder: "Buscar município, escola, candidato…",
        }}
      />
    </>
  );
}
