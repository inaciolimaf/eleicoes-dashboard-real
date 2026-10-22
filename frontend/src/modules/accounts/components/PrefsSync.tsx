import type { Density, Theme } from "../../../lib/prefs-store";
import { useMantineColorScheme } from "@mantine/core";
import { useEffect, useRef } from "react";
import { api } from "../../../api/client";
import { usePreferencesApi } from "../hooks";
import type { PreferencesDto } from "../../../api/models";
import { useAuth } from "../../../lib/auth-store";
import { usePrefs } from "../../../lib/prefs-store";

/** Aplica tema/animações e sincroniza preferências com o backend quando logado. */
export function PrefsSync() {
  const { setColorScheme } = useMantineColorScheme();
  const tema = usePrefs((s) => s.tema);
  const animacoes = usePrefs((s) => s.animacoes);
  const token = useAuth((s) => s.token);
  const remoto = usePreferencesApi();
  const carregado = useRef(false);

  useEffect(() => {
    setColorScheme(tema === "escuro" ? "dark" : tema === "claro" ? "light" : "auto");
  }, [tema, setColorScheme]);

  useEffect(() => {
    document.documentElement.classList.toggle("sem-animacoes", !animacoes);
  }, [animacoes]);

  // backend → local (uma vez por login)
  useEffect(() => {
    if (!token) {
      carregado.current = false;
      return;
    }
    if (!remoto.data || carregado.current) return;
    carregado.current = true;
    const r = remoto.data;
    const n = (r.notifications ?? {}) as { toasts?: string[]; push?: boolean };
    usePrefs.getState().carregar({
      ...(r.theme ? { tema: r.theme as Theme } : {}),
      ...(r.density ? { densidade: r.density as Density } : {}),
      ...(typeof r.animations === "boolean" ? { animacoes: r.animations } : {}),
      ...(r.candidate_colors ? { coresCandidatos: r.candidate_colors } : {}),
      ...(Array.isArray(n.toasts) ? { toasts: n.toasts } : {}),
      ...(typeof n.push === "boolean" ? { push: n.push } : {}),
    });
  }, [token, remoto.data]);

  // local → backend (debounce)
  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = usePrefs.subscribe((s) => {
      if (!carregado.current && remoto.isLoading) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const body: PreferencesDto = {
          theme: s.tema,
          density: s.densidade,
          animations: s.animacoes,
          candidate_colors: s.coresCandidatos,
          notifications: { toasts: s.toasts, push: s.push },
        };
        api("/preferences", { method: "PUT", body }).catch(() => undefined);
      }, 1200);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [token, remoto.isLoading]);

  return null;
}
