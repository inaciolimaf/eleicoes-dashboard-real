import { useEffect } from "react";
import { Navigate, type Params } from "react-router-dom";
import type { Level } from "../../../api/models";
import { FilterProvider } from "../../../lib/effective-filter";
import { geoAreaLink, levelOfSegment } from "../../../lib/geo-areas";
import { useFilter } from "../../../lib/filter-store";
import { ExploreContent } from "./ExploreContent";

/** Where the screen goes when the URL has no area: the last one the filter remembers, or the country. */
function fallbackPath(remembered: { nivel: Level; id: string }): string {
  const isUnit = remembered.nivel === "polling_place" || remembered.nivel === "section";
  return geoAreaLink(isUnit ? "country" : remembered.nivel, isUnit ? "br" : remembered.id);
}

/** Explore screen (`/explorar/:level/:id`). Places and sections redirect to their own pages. */
export function ExploreScreen({ params }: { params: Params }) {
  const filter = useFilter();
  const level = levelOfSegment(params.nivel);
  const id = params.id ? decodeURIComponent(params.id) : level === "country" ? "br" : null;

  // the URL is the source of truth: the filter follows it when the area changes
  useEffect(() => {
    const current = useFilter.getState();
    if (level && id && (current.nivel !== level || current.id !== id)) current.setRecorte(level, id);
  }, [level, id]);

  if (!level || !id) return <Navigate to={fallbackPath(filter)} replace />;
  if (level === "polling_place") return <Navigate to={`/locais/${encodeURIComponent(id)}`} replace />;
  if (level === "section") return <Navigate to={`/secoes/${encodeURIComponent(id)}`} replace />;
  return (
    <FilterProvider value={{ nivel: level, id }}>
      <ExploreContent key={`${level}:${id}`} level={level} id={id} />
    </FilterProvider>
  );
}
