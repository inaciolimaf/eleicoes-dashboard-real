import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/spotlight/styles.css";
import "@mantine/dates/styles.css";
import "./styles.css";
import "./lib/time";

import React, { Suspense, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, Loader, Center } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { DatesProvider } from "@mantine/dates";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./api/client";
import { criarTema } from "./theme";
import { usePrefs } from "./store/prefs";
import { useUi } from "./store/ui";
import { liveSocket } from "./realtime/socket";
import { PrefsSync } from "./PrefsSync";
import App from "./App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  },
});

liveSocket.iniciar(queryClient);

function Raiz() {
  const densidade = usePrefs((s) => s.densidade);
  const modoTv = useUi((s) => s.modoTv);
  const tema = useMemo(() => criarTema(modoTv ? 1.3 : densidade === "compacta" ? 0.92 : 1), [densidade, modoTv]);
  return (
    <MantineProvider theme={tema} defaultColorScheme="dark">
      <DatesProvider settings={{ locale: "pt-br", timezone: "America/Sao_Paulo", firstDayOfWeek: 0 }}>
        <ModalsProvider labels={{ confirm: "Confirmar", cancel: "Cancelar" }}>
          <Notifications position="top-right" limit={4} zIndex={1000} />
          <PrefsSync />
          <Suspense
            fallback={
              <Center h="100vh">
                <Loader />
              </Center>
            }
          >
            <App />
          </Suspense>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Raiz />
    </QueryClientProvider>
  </React.StrictMode>,
);
