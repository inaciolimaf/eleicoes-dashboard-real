import { Anchor, Breadcrumbs } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { GeoAreaRefDto, Level } from "../../../api/models";
import { useFilter } from "../../../lib/filter-store";
import { asLevel, defaultGeoAreaName, geoAreaLink } from "../../../lib/geo-areas";

/** Screens whose breadcrumb clicks navigate to the geo area's own page instead of only changing the filter. */
const GEO_PAGE_PREFIXES = ["/explorar", "/locais", "/secoes"];

/** Trail of the default scope (Brasil > UF > area), used when the API sent no breadcrumb. */
export function defaultBreadcrumb(level: Level, id: string, name?: string): GeoAreaRefDto[] {
  const trail: GeoAreaRefDto[] = [{ level: "country", id: "br", name: "Brasil" }];
  if (level === "country") return trail;
  const uf = id.slice(0, 2);
  trail.push({ level: "state", id: uf, name: defaultGeoAreaName("state", uf) });
  if (level !== "state") trail.push({ level, id, name: name ?? defaultGeoAreaName(level, id) });
  return trail;
}

/** Clickable breadcrumb of the geo area; the last crumb is the current one. */
export function GeoCrumbs({ crumbs }: { crumbs: GeoAreaRefDto[] }) {
  const filter = useFilter();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const goTo = (crumb: GeoAreaRefDto) => {
    const isLocalLevel = crumb.level === "polling_place" || crumb.level === "section";
    const onGeoPage = GEO_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (!isLocalLevel && !onGeoPage) {
      filter.setGeoArea(asLevel(crumb.level), crumb.id, crumb.name);
      return;
    }
    if (!isLocalLevel) filter.setGeoArea(asLevel(crumb.level), crumb.id, crumb.name);
    navigate(geoAreaLink(asLevel(crumb.level), crumb.id));
  };
  const lastIndex = crumbs.length - 1;
  return (
    <Breadcrumbs
      separator={<IconChevronRight size={12} />}
      separatorMargin={4}
      styles={{ root: { flexWrap: "nowrap" } }}
    >
      {crumbs.map((crumb, index) => (
        <Anchor
          key={`${crumb.level}:${crumb.id}`}
          component="button"
          type="button"
          size="sm"
          fw={index === lastIndex ? 700 : 500}
          c={index === lastIndex ? undefined : "dimmed"}
          onClick={() => goTo(crumb)}
          style={{ whiteSpace: "nowrap" }}
        >
          {crumb.name}
        </Anchor>
      ))}
    </Breadcrumbs>
  );
}
