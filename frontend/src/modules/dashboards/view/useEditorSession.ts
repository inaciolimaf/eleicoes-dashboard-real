import { useHotkeys } from "@mantine/hooks";
import { useEffect } from "react";
import { useFilter } from "../../../lib/filter-store";
import { applyGlobalFilter } from "../filter-sync";
import type { Dashboard } from "../repo";
import { useEditor } from "../editor";

/**
 * Opens a dashboard in the editor: loads its config, applies its global filter to the app, keeps
 * the global filter edited on screen in the dashboard config (without an undo entry), and binds
 * undo/redo while editing.
 */
export function useEditorSession(dashboard: Dashboard) {
  useEffect(() => {
    useEditor.getState().load(dashboard.id, dashboard.config);
    applyGlobalFilter(dashboard.config);
    // the editor reloads only when the dashboard id changes, not on every config change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.id]);

  useEffect(() => () => useEditor.getState().reset(), []);

  useEffect(
    () =>
      useFilter.subscribe((state) => {
        const editor = useEditor.getState();
        if (editor.dashboardId !== dashboard.id || !editor.config) return;
        const filter = editor.config.filtroGlobal;
        if (
          filter.turno === state.turno &&
          filter.cargo === state.cargo &&
          filter.nivel === state.nivel &&
          filter.recorte === state.id &&
          (filter.ciclo ?? null) === state.ciclo
        )
          return;
        editor.apply(
          (config) => ({
            ...config,
            filtroGlobal: {
              ...config.filtroGlobal,
              turno: state.turno,
              cargo: state.cargo,
              nivel: state.nivel,
              recorte: state.id,
              ciclo: state.ciclo,
            },
          }),
          { history: false },
        );
      }),
    [dashboard.id],
  );

  const editing = useEditor((state) => state.editing);
  useHotkeys(
    editing
      ? [
          ["mod+Z", () => useEditor.getState().undo()],
          ["mod+shift+Z", () => useEditor.getState().redo()],
          ["mod+Y", () => useEditor.getState().redo()],
        ]
      : [],
  );
}
