import { Stack } from "@mantine/core";
import type { Level } from "../../../api/models";
import { ExploreHeader } from "./ExploreHeader";
import { ResultLayout, StateChoiceLayout } from "./ExploreLayouts";
import { useExploreState } from "./useExploreState";

/** Explore screen of one geo area: the header, then the layout for the office (with or without a national result). */
export function ExploreContent({ level, id }: { level: Level; id: string }) {
  const state = useExploreState(level, id);
  const { filter } = state;
  return (
    <Stack gap="md">
      <ExploreHeader
        filter={filter}
        level={level}
        id={id}
        name={state.name}
        parent={state.parent}
        favorite={state.favorite}
        onToggleFavorite={state.toggleFavorite}
        onOpenArea={state.openArea}
        showResultExport={!state.withoutBrResult}
      />
      {state.withoutBrResult ? (
        <StateChoiceLayout state={state} level={level} id={id} filter={filter} />
      ) : (
        <ResultLayout state={state} level={level} id={id} filter={filter} />
      )}
    </Stack>
  );
}
