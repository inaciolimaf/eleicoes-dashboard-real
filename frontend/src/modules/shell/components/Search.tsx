import { Spotlight, spotlight, type SpotlightActionGroupData } from "@mantine/spotlight";
import { Button, Kbd, Loader, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconBuildingCommunity,
  IconMap,
  IconMapPin,
  IconSchool,
  IconSearch,
  IconUser,
  IconBox,
  type Icon,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../hooks";
import type { SearchItemDto, Level, SearchType } from "../../../api/models";
import { geoAreaLink } from "../../../lib/geo-areas";
import { officeForState } from "../../../lib/offices";
import { useFilter } from "../../../lib/filter-store";

const GRUPO: Record<SearchType, { rotulo: string; icone: Icon }> = {
  candidate: { rotulo: "Candidatos", icone: IconUser },
  state: { rotulo: "UFs", icone: IconMap },
  municipality: { rotulo: "Municípios", icone: IconBuildingCommunity },
  zone: { rotulo: "Zonas", icone: IconMapPin },
  polling_place: { rotulo: "Locais de votação", icone: IconSchool },
  section: { rotulo: "Seções", icone: IconBox },
};

/** Busca global (Ctrl+K) sobre /busca. */
export function Search() {
  const [q, setQ] = useState("");
  const [deb] = useDebouncedValue(q, 220);
  const r = useSearch(deb);
  const navigate = useNavigate();

  const abrir = (it: SearchItemDto) => {
    if (it.type === "candidato") {
      if (it.office_code)
        useFilter
          .getState()
          .setFiltro({ cargo: officeForState(Number(it.office_code), it.state_code ?? null) });
      navigate(`/candidatos/${encodeURIComponent(it.id)}`);
      return;
    }
    const nivel = (it.level ?? it.type) as Level;
    if (nivel !== "polling_place" && nivel !== "section")
      useFilter.getState().setRecorte(nivel, it.id, it.title);
    navigate(geoAreaLink(nivel, it.id));
  };

  const actions = useMemo<SpotlightActionGroupData[]>(() => {
    const grupos = new Map<SearchType, SearchItemDto[]>();
    for (const it of r.data?.items ?? []) {
      const l = grupos.get(it.type as SearchType);
      if (l) l.push(it);
      else grupos.set(it.type as SearchType, [it]);
    }
    return (Object.keys(GRUPO) as SearchType[])
      .filter((t) => grupos.has(t))
      .map((t) => {
        const G = GRUPO[t];
        return {
          group: G.rotulo,
          actions: grupos.get(t)!.map((it) => ({
            id: `${it.type}:${it.id}`,
            label: it.title,
            description: it.subtitle ?? undefined,
            leftSection: <G.icone size={20} stroke={1.6} />,
            onClick: () => abrir(it),
          })),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.data]);

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
        query={q}
        onQueryChange={setQ}
        filter={(_q, a) => a}
        shortcut={["mod + K", "/"]}
        nothingFound={
          deb.trim().length < 2 ? (
            <Text size="sm" c="dimmed">
              Município, zona (“zona 1 SP”), seção, escola, bairro, candidato (nome ou número) ou partido
            </Text>
          ) : r.isFetching ? (
            <Loader size="sm" />
          ) : (
            "Nada encontrado"
          )
        }
        highlightQuery
        scrollable
        maxHeight={460}
        searchProps={{
          leftSection: r.isFetching ? <Loader size={16} /> : <IconSearch size={18} />,
          placeholder: "Buscar município, escola, candidato…",
        }}
      />
    </>
  );
}
