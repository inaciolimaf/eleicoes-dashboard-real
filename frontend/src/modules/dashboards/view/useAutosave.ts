import { notifications } from "@mantine/notifications";
import { useEffect, useRef, useState } from "react";
import { SCHEMA_VERSION } from "../schema";
import type { DashboardChange } from "../repo";
import { useEditor } from "../editor";

/** Delay (ms) after the last change before the dashboard is saved. */
const SAVE_DELAY_MS = 900;

/**
 * Saves the edited config a moment after the last change (debounce). Returns whether a save is
 * running and when the last one finished.
 */
export function useAutosave(
  dashboardId: string,
  save: (id: string, change: DashboardChange) => Promise<void>,
) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const editor = useEditor();
  // the timer must call the latest `save` without restarting on every render
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (editor.dashboardId !== dashboardId || !editor.config || editor.version === 0) return;
    const config = editor.config;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await saveRef.current(dashboardId, { config: { ...config, schemaVersion: SCHEMA_VERSION } });
        setSavedAt(new Date());
      } catch (error) {
        notifications.show({
          color: "red",
          title: "Não foi possível salvar o painel",
          message: (error as Error).message,
        });
      } finally {
        setSaving(false);
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [editor.version, editor.config, editor.dashboardId, dashboardId]);

  return { saving, savedAt };
}
