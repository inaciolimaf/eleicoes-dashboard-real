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
import { useBusca } from "../../api/hooks";
import type { ItemBusca, Nivel, TipoBusca } from "../../api/types";
import { linkRecorte } from "../../lib/recortes";
import { cargoParaUf } from "../../lib/cargos";
import { useFiltro } from "../../store/filtro";

const GRUPO: Record<TipoBusca, { rotulo: string; icone: Icon }> = {
  candidato: { rotulo: "Candidatos", icone: IconUser },
  uf: { rotulo: "UFs", icone: IconMap },
  municipio: { rotulo: "Municípios", icone: IconBuildingCommunity },
  zona: { rotulo: "Zonas", icone: IconMapPin },
  local: { rotulo: "Locais de votação", icone: IconSchool },
  secao: { rotulo: "Seções", icone: IconBox },
};

/** Busca global (Ctrl+K) sobre /busca. */
export function Busca() {
  const [q, setQ] = useState("");
  const [deb] = useDebouncedValue(q, 220);
  const r = useBusca(deb);
  const navigate = useNavigate();

  const abrir = (it: ItemBusca) => {
    if (it.tipo === "candidato") {
      if (it.cargo) useFiltro.getState().setFiltro({ cargo: cargoParaUf(Number(it.cargo), it.uf ?? null) });
      navigate(`/candidatos/${encodeURIComponent(it.id)}`);
      return;
    }
    const nivel = (it.nivel ?? it.tipo) as Nivel;
    if (nivel !== "local" && nivel !== "secao") useFiltro.getState().setRecorte(nivel, it.id, it.titulo);
    navigate(linkRecorte(nivel, it.id));
  };

  const actions = useMemo<SpotlightActionGroupData[]>(() => {
    const grupos = new Map<TipoBusca, ItemBusca[]>();
    for (const it of r.data?.itens ?? []) {
      const l = grupos.get(it.tipo);
      if (l) l.push(it);
      else grupos.set(it.tipo, [it]);
    }
    return (Object.keys(GRUPO) as TipoBusca[])
      .filter((t) => grupos.has(t))
      .map((t) => {
        const G = GRUPO[t];
        return {
          group: G.rotulo,
          actions: grupos.get(t)!.map((it) => ({
            id: `${it.tipo}:${it.id}`,
            label: it.titulo,
            description: it.subtitulo ?? undefined,
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
        styles={{ inner: { justifyContent: "space-between" }, label: { fontWeight: 400, color: "var(--mantine-color-dimmed)" } }}
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
        searchProps={{ leftSection: r.isFetching ? <Loader size={16} /> : <IconSearch size={18} />, placeholder: "Buscar município, escola, candidato…" }}
      />
    </>
  );
}
