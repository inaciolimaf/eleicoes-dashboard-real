import { ActionIcon, Anchor, Badge, Breadcrumbs, Group, ScrollArea, Text, Tooltip } from "@mantine/core";
import {
  IconChevronRight,
  IconClockHour4,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconX,
} from "@tabler/icons-react";
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useResults, useStatus } from "../../results";
import { ENVIRONMENT } from "./LiveIndicator";
import type { GeoAreaRefDto, Level } from "../../../api/models";
import { useFilter } from "../../../lib/filter-store";
import { useTime } from "../../../lib/time-store";
import { useFavorites } from "../../accounts";
import { geoAreaLink, defaultGeoAreaName } from "../../../lib/geo-areas";
import { OFFICE_NAME } from "../../../lib/offices";
import { fmtShortDate } from "../../../lib/time";
import { useOfficeWithoutBrResult } from "../../results";
import { spotlight } from "@mantine/spotlight";
import { asLevel } from "../../../lib/geo-areas";

function breadcrumbPadrao(nivel: Level, id: string, nome?: string): GeoAreaRefDto[] {
  const l: GeoAreaRefDto[] = [{ level: "country", id: "br", name: "Brasil" }];
  if (nivel === "country") return l;
  const uf = id.slice(0, 2);
  l.push({ level: "state", id: uf, name: defaultGeoAreaName("state", uf) });
  if (nivel !== "state") l.push({ level: nivel, id, name: nome ?? defaultGeoAreaName(nivel, id) });
  return l;
}

/** Barra de filtro global: breadcrumb clicável, cargo, chip de tempo e favoritos. */
export function FilterBar() {
  const f = useFilter();
  const t = useTime((s) => s.t);
  const aoVivo = useTime((s) => s.aoVivo);
  const navigate = useNavigate();
  const loc = useLocation();
  const semBr = useOfficeWithoutBrResult(f.cargo, f.nivel);
  const q = useResults(
    { turno: f.turno, cargo: f.cargo, nivel: f.nivel, id: f.id, t },
    !semBr && f.nivel !== "country",
  );
  const { favoritos, eFavorito, alternar } = useFavorites();
  const status = useStatus();
  const crumbs = q.data?.geo_area.breadcrumb?.length
    ? q.data.geo_area.breadcrumb
    : breadcrumbPadrao(f.nivel, f.id, f.nome);
  const atual = crumbs[crumbs.length - 1];

  // guarda o nome do recorte para os chips dos widgets
  useEffect(() => {
    if (q.data?.geo_area?.name && q.data.geo_area.id === f.id && q.data.geo_area.name !== f.nome)
      useFilter.getState().setFiltro({ nome: q.data.geo_area.name });
  }, [q.data, f.id, f.nome]);

  const ir = (c: GeoAreaRefDto) => {
    if (
      c.level === "polling_place" ||
      c.level === "section" ||
      loc.pathname.startsWith("/explorar") ||
      loc.pathname.startsWith("/locais") ||
      loc.pathname.startsWith("/secoes")
    ) {
      if (c.level !== "polling_place" && c.level !== "section") f.setRecorte(asLevel(c.level), c.id, c.name);
      navigate(geoAreaLink(asLevel(c.level), c.id));
    } else f.setRecorte(asLevel(c.level), c.id, c.name);
  };

  const fav = eFavorito("geo_area", `${f.nivel}:${f.id}`);

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      px={{ base: "xs", sm: "md" }}
      py={6}
      style={{
        borderBottom: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-body)",
      }}
    >
      <ScrollArea type="never" style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs" wrap="nowrap">
          <Breadcrumbs
            separator={<IconChevronRight size={12} />}
            separatorMargin={4}
            styles={{ root: { flexWrap: "nowrap" } }}
          >
            {crumbs.map((c, i) => (
              <Anchor
                key={`${c.level}:${c.id}`}
                component="button"
                type="button"
                size="sm"
                fw={i === crumbs.length - 1 ? 700 : 500}
                c={i === crumbs.length - 1 ? undefined : "dimmed"}
                onClick={() => ir(c)}
                style={{ whiteSpace: "nowrap" }}
              >
                {c.name}
              </Anchor>
            ))}
          </Breadcrumbs>
          <Tooltip label={fav ? "Remover dos favoritos" : "Adicionar recorte aos favoritos"}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="yellow"
              onClick={() =>
                alternar({ type: "geo_area", ref: `${f.nivel}:${f.id}`, label: atual?.name ?? f.id })
              }
              aria-label="Favoritar recorte"
            >
              {fav ? <IconStarFilled size={14} /> : <IconStar size={14} />}
            </ActionIcon>
          </Tooltip>
          <Badge variant="light" color="gray" size="sm" style={{ flexShrink: 0 }}>
            {OFFICE_NAME[f.cargo] ?? `Cargo ${f.cargo}`} · {f.turno}º turno
          </Badge>
          {status.data && status.data.tse_environment !== "oficial" && (
            <Tooltip label="Ambiente de dados (não é o resultado oficial)">
              <Badge variant="outline" color="grape" size="sm" style={{ flexShrink: 0 }}>
                {ENVIRONMENT[status.data.tse_environment] ?? status.data.tse_environment}
              </Badge>
            </Tooltip>
          )}
          {t && (
            <Badge
              color="yellow"
              variant="light"
              size="sm"
              leftSection={<IconClockHour4 size={12} />}
              rightSection={
                <ActionIcon
                  size={14}
                  variant="transparent"
                  color="yellow"
                  onClick={aoVivo}
                  aria-label="Voltar ao vivo"
                >
                  <IconX size={10} />
                </ActionIcon>
              }
              style={{ flexShrink: 0 }}
            >
              {fmtShortDate(t)}
            </Badge>
          )}
          {favoritos.length > 0 && (
            <>
              <Text size="xs" c="dimmed" visibleFrom="md" style={{ whiteSpace: "nowrap" }}>
                Favoritos:
              </Text>
              {favoritos.slice(0, 12).map((fv) => {
                const destino =
                  fv.type === "candidate"
                    ? `/candidatos/${fv.ref}`
                    : fv.type === "polling_place"
                      ? `/locais/${fv.ref}`
                      : (() => {
                          const [n, ...r] = fv.ref.split(":");
                          return geoAreaLink(n as Level, r.join(":"));
                        })();
                return (
                  <Badge
                    key={`${fv.type}:${fv.ref}`}
                    component={Link}
                    to={destino}
                    variant="outline"
                    color={fv.type === "candidate" ? "grape" : "yellow"}
                    size="sm"
                    style={{ cursor: "pointer", flexShrink: 0, textTransform: "none" }}
                    leftSection={<IconStarFilled size={10} />}
                  >
                    {fv.label}
                  </Badge>
                );
              })}
            </>
          )}
        </Group>
      </ScrollArea>
      <Tooltip label="Buscar recorte (Ctrl+K)">
        <ActionIcon variant="subtle" onClick={spotlight.open} aria-label="Buscar recorte">
          <IconSearch size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
