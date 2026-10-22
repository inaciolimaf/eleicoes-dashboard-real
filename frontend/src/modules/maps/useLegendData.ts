import { useMemo } from "react";
import type { ChildrenDto, MapPollingPlacesDto } from "../../api/models";
import type { CandidateColorFn } from "./mapColors";
import { countByStatus, legendItemsOf, municipalityWins, partyTotals } from "./legendData";
import type { MapMode } from "./mapScope";

/** What the legend shows, derived from the places and the regions. */
export function useLegendData(
  mode: MapMode,
  places: MapPollingPlacesDto | undefined,
  data: ChildrenDto | undefined,
  countryWinners: ChildrenDto | undefined,
  candidateColor: CandidateColorFn,
) {
  const items = useMemo(
    () => legendItemsOf(mode, places?.items ?? [], data, candidateColor),
    [mode, places, data, candidateColor],
  );
  const wins = useMemo(() => municipalityWins(countryWinners), [countryWinners]);
  const statusCounts = useMemo(() => countByStatus(places?.items ?? []), [places]);
  const parties = useMemo(() => partyTotals(data), [data]);
  return { items, wins, statusCounts, parties };
}
