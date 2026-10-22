import { Badge, Button, Divider, Group, NavLink, ScrollArea, Stack, Text, Tooltip } from "@mantine/core";
import {
  IconBell,
  IconCalendarEvent,
  IconCompass,
  IconDeviceTv,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconMap2,
  IconPlus,
  IconSettings,
  IconShieldLock,
  IconStarFilled,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../../lib/auth-store";
import { useFilter } from "../../../lib/filter-store";
import { useUi } from "../../../lib/ui-store";
import { geoAreaLink } from "../../../lib/geo-areas";
import type { Level } from "../../../api/models";
import { useDashboards, NewDashboardModal } from "../../dashboards";
import { ElectionSelector, OfficeSelector } from "./Selectors";

const NAV_RADIUS = { borderRadius: 8 };

/** A navigation entry; a click on it closes the navbar on small screens. */
function NavItem({
  to,
  label,
  icon: Icone,
  extra,
}: {
  to: string;
  label: string;
  icon: Icon;
  extra?: ReactNode;
}) {
  const { pathname } = useLocation();
  const closeNavbar = useUi((s) => s.setNavbar);
  const path = to.split("?")[0];
  const active = pathname === path || pathname.startsWith(path + "/");
  return (
    <NavLink
      component={Link}
      to={to}
      label={label}
      leftSection={<Icone size={18} stroke={1.6} />}
      rightSection={extra}
      active={active}
      onClick={() => closeNavbar(false)}
      style={NAV_RADIUS}
    />
  );
}

/** One link per dashboard the user has; the default one also answers the home screen. */
function DashboardLinks() {
  const { pathname } = useLocation();
  const { dashboards } = useDashboards();
  const closeNavbar = useUi((s) => s.setNavbar);
  if (dashboards.length === 0)
    return (
      <NavLink
        component={Link}
        to="/"
        label="Noite da eleição"
        description="template"
        leftSection={<IconLayoutDashboard size={18} stroke={1.6} />}
        active={pathname === "/"}
      />
    );
  return (
    <>
      {dashboards.map((dashboard) => (
        <NavLink
          key={dashboard.id}
          component={Link}
          to={`/paineis/${dashboard.id}`}
          label={dashboard.name}
          leftSection={<IconLayoutDashboard size={18} stroke={1.6} />}
          rightSection={
            dashboard.isDefault ? <IconStarFilled size={12} color="var(--mantine-color-yellow-5)" /> : undefined
          }
          active={pathname === `/paineis/${dashboard.id}` || (pathname === "/" && dashboard.isDefault)}
          onClick={() => closeNavbar(false)}
          style={NAV_RADIUS}
        />
      ))}
    </>
  );
}

/** Explore goes to the current geo area; polling places and sections explore from Brazil. */
function exploreTarget(level: Level, id: string): string {
  const local = level === "polling_place" || level === "section";
  return geoAreaLink(local ? "country" : level, local ? "br" : id);
}

export function Navbar() {
  const user = useAuth((s) => s.user);
  const filter = useFilter();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <ScrollArea h="100%" type="scroll" className="scroll-fino">
        <Stack gap={2} p="xs">
          <Stack
            gap="xs"
            hiddenFrom="sm"
            pb="sm"
            mb={4}
            style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
          >
            <ElectionSelector width="100%" />
            <OfficeSelector onlySelect />
          </Stack>
          <Group justify="space-between" px={6} pt={4}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              Painéis
            </Text>
            <Tooltip label="Novo painel (templates)">
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={<IconPlus size={12} />}
                onClick={() => setCreating(true)}
              >
                Criar
              </Button>
            </Tooltip>
          </Group>
          <DashboardLinks />
          <NavItem to="/paineis" label="Gerenciar painéis" icon={IconLayoutGrid} />
          <NavItem to="/tv" label="Modo TV" icon={IconDeviceTv} />
          <Divider my={6} />
          <NavItem to={exploreTarget(filter.nivel, filter.id)} label="Explorar" icon={IconCompass} />
          <NavItem to="/mapas" label="Mapas" icon={IconMap2} />
          <NavItem to="/candidatos" label="Candidatos" icon={IconUsers} />
          <NavItem
            to="/eventos"
            label="Eventos"
            icon={IconCalendarEvent}
            extra={
              <Badge size="xs" variant="dot" color="red">
                ao vivo
              </Badge>
            }
          />
          <NavItem to="/alertas" label="Alertas" icon={IconBell} />
          <Divider my={6} />
          <NavItem to="/conta" label="Preferências" icon={IconSettings} />
          {user?.is_admin && <NavItem to="/admin" label="Admin" icon={IconShieldLock} />}
        </Stack>
      </ScrollArea>
      <NewDashboardModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
