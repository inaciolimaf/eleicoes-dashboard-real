import { Alert, AppShell, Box, Loader, Transition } from "@mantine/core";
import { IconPlugConnected } from "@tabler/icons-react";
import { Suspense, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useFilter } from "../../../lib/filter-store";
import { useDesktopNav, useUi } from "../../../lib/ui-store";
import { topic, useLive } from "../../realtime";
import { AuthModal } from "../../accounts";
import { Header } from "./Header";
import { Navbar } from "./Navbar";
import { FilterBar } from "./FilterBar";
import { TimeSlider } from "./TimeSlider";

/** The banner waits this long before it shows, so a quick reconnect does not flash it. */
const RECONNECT_BANNER_DELAY_MS = 2500;

function ReconnectBanner() {
  const socketState = useUi((s) => s.wsEstado);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (socketState !== "reconectando") {
      setVisible(false);
      return;
    }
    const id = setTimeout(() => setVisible(true), RECONNECT_BANNER_DELAY_MS);
    return () => clearTimeout(id);
  }, [socketState]);
  return (
    <Transition mounted={visible} transition="slide-down" duration={200}>
      {(styles) => (
        <Alert
          style={{
            ...styles,
            position: "fixed",
            top: 64,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 300,
            boxShadow: "var(--mantine-shadow-md)",
          }}
          color="yellow"
          variant="filled"
          py={6}
          icon={<IconPlugConnected size={16} />}
        >
          Reconectando ao tempo real… os dados podem estar defasados.
        </Alert>
      )}
    </Transition>
  );
}

export function Loading() {
  return (
    <Box p="xl" style={{ display: "flex", justifyContent: "center" }}>
      <Loader />
    </Box>
  );
}

/** AppShell: header, navbar recolhível, barra de filtro, conteúdo e slider de tempo fixo no rodapé. */
export function AppLayout() {
  const navbarOpen = useUi((s) => s.navbarAberta);
  const desktopNavOpen = useDesktopNav((s) => s.aberta);
  const round = useFilter((s) => s.turno);
  // global topics: events (toasts) and status
  useLive([topic.events(round), topic.status()]);
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: "sm", collapsed: { mobile: !navbarOpen, desktop: !desktopNavOpen } }}
      footer={{ height: 64 }}
      padding={0}
      transitionDuration={250}
    >
      <AppShell.Header>
        <Header />
      </AppShell.Header>
      <AppShell.Navbar>
        <Navbar />
      </AppShell.Navbar>
      <AppShell.Main>
        <Box style={{ position: "sticky", top: 60, zIndex: 50 }}>
          <FilterBar />
        </Box>
        <Box p={{ base: "xs", sm: "md" }} pb="xl">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </Box>
      </AppShell.Main>
      <AppShell.Footer>
        <TimeSlider />
      </AppShell.Footer>
      <ReconnectBanner />
      <AuthModal />
    </AppShell>
  );
}
