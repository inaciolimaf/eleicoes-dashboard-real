import { useEffect, useRef } from "react";
import { useMantineColorScheme } from "@mantine/core";
import { api } from "../../../api/client";
import type { PreferencesDto } from "../../../api/models";
import { useAuth } from "../../../lib/auth-store";
import { usePrefs, type Density, type Theme } from "../../../lib/prefs-store";
import { usePreferencesApi } from "../hooks";

/** Waits this long after the last local change before saving the preferences to the API. */
const SAVE_DEBOUNCE_MS = 1200;

/** Applies the theme and the animations switch, and keeps the preferences in step with the API when logged in. */
export function PrefsSync() {
  const { setColorScheme } = useMantineColorScheme();
  const theme = usePrefs((s) => s.tema);
  const animations = usePrefs((s) => s.animacoes);
  const token = useAuth((s) => s.token);
  const remote = usePreferencesApi();
  const loadedFromApi = useRef(false);

  useEffect(() => {
    setColorScheme(theme === "escuro" ? "dark" : theme === "claro" ? "light" : "auto");
  }, [theme, setColorScheme]);

  useEffect(() => {
    document.documentElement.classList.toggle("sem-animacoes", !animations);
  }, [animations]);

  // API -> local, once per login
  useEffect(() => {
    if (!token) {
      loadedFromApi.current = false;
      return;
    }
    if (!remote.data || loadedFromApi.current) return;
    loadedFromApi.current = true;
    const saved = remote.data;
    const notifications = (saved.notifications ?? {}) as { toasts?: string[]; push?: boolean };
    usePrefs.getState().carregar({
      ...(saved.theme ? { tema: saved.theme as Theme } : {}),
      ...(saved.density ? { densidade: saved.density as Density } : {}),
      ...(typeof saved.animations === "boolean" ? { animacoes: saved.animations } : {}),
      ...(saved.candidate_colors ? { coresCandidatos: saved.candidate_colors } : {}),
      ...(Array.isArray(notifications.toasts) ? { toasts: notifications.toasts } : {}),
      ...(typeof notifications.push === "boolean" ? { push: notifications.push } : {}),
    });
  }, [token, remote.data]);

  // local -> API, debounced
  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = usePrefs.subscribe((state) => {
      if (!loadedFromApi.current && remote.isLoading) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const body: PreferencesDto = {
          theme: state.tema,
          density: state.densidade,
          animations: state.animacoes,
          candidate_colors: state.coresCandidatos,
          notifications: { toasts: state.toasts, push: state.push },
        };
        api("/preferences", { method: "PUT", body }).catch(() => undefined);
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [token, remote.isLoading]);

  return null;
}
