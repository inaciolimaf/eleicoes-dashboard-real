import { ActionIcon, Box, Burger, Group, Text, Tooltip, useComputedColorScheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconChartBar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMoonStars,
  IconSun,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { usePrefs } from "../../../lib/prefs-store";
import { useDesktopNav, useUi } from "../../../lib/ui-store";
import { UserMenu } from "../../accounts";
import { Search } from "./Search";
import { LiveIndicator } from "./LiveIndicator";
import { ElectionSelector, OfficeSelector } from "./Selectors";

/** Logo that goes back to the home screen. */
function Brand() {
  return (
    <Group
      gap={6}
      renderRoot={(props) => <Link to="/" {...props} />}
      style={{ textDecoration: "none", color: "inherit" }}
      wrap="nowrap"
    >
      <IconChartBar size={24} color="var(--mantine-color-eleicao-4)" />
      <Text fw={800} size="lg" visibleFrom="md" style={{ letterSpacing: -0.4, whiteSpace: "nowrap" }}>
        Apuração
        <Text span c="eleicao.4" inherit>
          {" "}
          2026
        </Text>
      </Text>
    </Group>
  );
}

/** Switches between the dark ("noite da eleição") and the light theme. */
function ThemeToggle() {
  const themePref = usePrefs((s) => s.tema);
  const setPrefs = usePrefs((s) => s.set);
  const scheme = useComputedColorScheme("dark");
  const isDark = scheme === "dark";
  return (
    <Tooltip label={isDark ? "Tema claro" : "Tema escuro (noite da eleição)"}>
      <ActionIcon
        variant="default"
        size="lg"
        onClick={() => setPrefs({ tema: isDark ? "claro" : "escuro" })}
        aria-label="Alternar tema"
        data-tema={themePref}
      >
        {isDark ? <IconSun size={18} /> : <IconMoonStars size={18} />}
      </ActionIcon>
    </Tooltip>
  );
}

export function Header() {
  const navbarOpen = useUi((s) => s.navbarAberta);
  const toggleNavbar = useUi((s) => s.toggleNavbar);
  const desktopNav = useDesktopNav();
  const isMobile = useMediaQuery("(max-width: 48em)");
  return (
    <Group h="100%" px={{ base: "xs", sm: "md" }} justify="space-between" wrap="nowrap" gap="xs">
      <Group gap="xs" wrap="nowrap">
        <Burger
          opened={navbarOpen}
          onClick={toggleNavbar}
          hiddenFrom="sm"
          size="sm"
          aria-label="Abrir menu"
        />
        <Tooltip label={desktopNav.aberta ? "Recolher menu" : "Expandir menu"}>
          <ActionIcon
            variant="subtle"
            onClick={desktopNav.toggle}
            visibleFrom="sm"
            aria-label="Alternar menu lateral"
          >
            {desktopNav.aberta ? (
              <IconLayoutSidebarLeftCollapse size={18} />
            ) : (
              <IconLayoutSidebarLeftExpand size={18} />
            )}
          </ActionIcon>
        </Tooltip>
        <Brand />
        <Box visibleFrom="sm">
          <ElectionSelector />
        </Box>
        <OfficeSelector />
      </Group>
      <Group gap="xs" wrap="nowrap">
        <Search />
        <LiveIndicator compacto={!!isMobile} />
        <ThemeToggle />
        <UserMenu />
      </Group>
    </Group>
  );
}
