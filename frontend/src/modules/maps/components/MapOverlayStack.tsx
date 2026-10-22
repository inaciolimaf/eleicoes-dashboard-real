import type { ElectoralMapModel } from "../useElectoralMap";
import { Legend } from "./Legend";
import { MapTooltip } from "./MapTooltip";
import {
  CandidateSelectors,
  EmptyPlacesBadge,
  LoadingBadge,
  MapError,
  MapReadyFallback,
  PlacesNotes,
} from "./MapOverlays";

/** Everything drawn over the canvas: selectors, notes, legend, status badges and the tooltip. */
export function MapOverlayStack({ model }: { model: ElectoralMapModel }) {
  const { type, mode, efA, efB, places, loading, error, base, needsValues, props } = model;
  const { highlight, setHighlight, legend, scale, unit, colorA, colorB, picking } = model;
  return (
    <>
      {!model.framing.ready && <MapReadyFallback onReady={() => model.framing.setReady(true)} />}
      {model.seletorCandidatos && needsValues && mode !== "pontos" && model.candidateOptions.length > 0 && (
        <CandidateSelectors
          comparison={type === "comparativo"}
          options={model.candidateOptions}
          candidateA={efA}
          candidateB={efB}
          onChangeA={(value) => {
            model.setChoiceA(value);
            props.onCandidatesChange?.(value, efB);
          }}
          onChangeB={(value) => {
            model.setChoiceB(value);
            props.onCandidatesChange?.(efA, value);
          }}
        />
      )}
      <PlacesNotes pointsMode={mode === "pontos"} showsValues={needsValues} places={places.data} />
      {props.legenda !== false && !error && (
        <Legend
          type={type}
          candidates={legend.items}
          highlight={highlight}
          onHighlight={setHighlight}
          unit={unit}
          scale={scale}
          labelA={model.candidateName(efA)}
          labelB={model.candidateName(efB)}
          colorA={colorA}
          colorB={colorB}
          statusCounts={legend.statusCounts}
          municipalityWins={legend.wins}
          parties={legend.parties}
        />
      )}
      {loading && <LoadingBadge />}
      {error && (
        <MapError error={error} onRetry={() => (mode !== "pontos" ? base.refetch() : places.refetch())} />
      )}
      {!loading && !error && mode === "pontos" && places.data && places.data.items.length === 0 && (
        <EmptyPlacesBadge />
      )}
      {picking.hover && (
        <MapTooltip
          hover={picking.hover}
          box={model.boxSize}
          type={type}
          candidateA={efA}
          candidateB={efB}
          candidateColor={model.candidateColor}
        />
      )}
    </>
  );
}
