import { Alert, AppShell, Box, Loader, Transition } from "@mantine/core";
import { IconPlugConnected } from "@tabler/icons-react";
import { Suspense, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useFilter } from "../../../lib/filter-store";
import { useDesktopNav, useUi } from "../../../lib/ui-store";
import { useLive } from "../../realtime";
import { topic } from "../../realtime";
import { Header } from "./Header";
import { Navbar } from "./Navbar";
import { FilterBar } from "./FilterBar";
import { TimeSlider } from "./TimeSlider";
import { AuthModal } from "../../accounts";

function BannerReconexao() {
  const ws = useUi((s) => s.wsEstado);
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    if (ws !== "reconectando") {
      setMostrar(false);
      return;
    }
    const id = setTimeout(() => setMostrar(true), 2500);
    return () => clearTimeout(id);
  }, [ws]);
  return (
    <Transition mounted={mostrar} transition="slide-down" duration={200}>
      {(st) => (
        <Alert
          style={{
            ...st,
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
  const navbarAberta = useUi((s) => s.navbarAberta);
  const desktop = useDesktopNav((s) => s.aberta);
  const turno = useFilter((s) => s.turno);
  // tópicos globais: eventos (toasts) e status
  useLive([topic.events(turno), topic.status()]);
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: "sm", collapsed: { mobile: !navbarAberta, desktop: !desktop } }}
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
      <BannerReconexao />
      <AuthModal />
    </AppShell>
  );
}
