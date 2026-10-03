import { useMantineColorScheme } from "@mantine/core";
import { useEffect, useRef } from "react";
import { api } from "./api/client";
import { usePreferenciasApi } from "./api/hooks";
import type { PreferenciasApi } from "./api/types";
import { useAuth } from "./store/auth";
import { usePrefs } from "./store/prefs";

/** Aplica tema/animações e sincroniza preferências com o backend quando logado. */
export function PrefsSync() {
  const { setColorScheme } = useMantineColorScheme();
  const tema = usePrefs((s) => s.tema);
  const animacoes = usePrefs((s) => s.animacoes);
  const token = useAuth((s) => s.token);
  const remoto = usePreferenciasApi();
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
    const n = (r.notificacoes ?? {}) as { toasts?: string[]; push?: boolean };
    usePrefs.getState().carregar({
      ...(r.tema ? { tema: r.tema } : {}),
      ...(r.densidade ? { densidade: r.densidade } : {}),
      ...(typeof r.animacoes === "boolean" ? { animacoes: r.animacoes } : {}),
      ...(r.cores_candidatos ? { coresCandidatos: r.cores_candidatos } : {}),
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
        const body: PreferenciasApi = {
          tema: s.tema,
          densidade: s.densidade,
          animacoes: s.animacoes,
          cores_candidatos: s.coresCandidatos,
          notificacoes: { toasts: s.toasts, push: s.push },
        };
        api("/preferencias", { method: "PUT", body }).catch(() => undefined);
      }, 1200);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [token, remoto.isLoading]);

  return null;
}
