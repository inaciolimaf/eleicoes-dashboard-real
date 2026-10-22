import { useMemo, type ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { DatesProvider } from "@mantine/dates";
import { buildTheme } from "./theme";
import { usePrefs } from "./lib/prefs-store";
import { useUi } from "./lib/ui-store";
import { PrefsSync } from "./modules/accounts";

/** Theme, dates, modals and toasts around the app; the screen tests render inside the same providers. */
export function AppProviders({ children }: { children: ReactNode }) {
  const density = usePrefs((s) => s.densidade);
  const tvMode = useUi((s) => s.tvMode);
  const theme = useMemo(
    () => buildTheme(tvMode ? 1.3 : density === "compacta" ? 0.92 : 1),
    [density, tvMode],
  );
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <DatesProvider settings={{ locale: "pt-br", timezone: "America/Sao_Paulo", firstDayOfWeek: 0 }}>
        <ModalsProvider labels={{ confirm: "Confirmar", cancel: "Cancelar" }}>
          <Notifications position="top-right" limit={4} zIndex={1000} />
          <PrefsSync />
          {children}
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
