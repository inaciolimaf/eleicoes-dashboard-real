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
} from "@tabler/icons-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../store/auth";
import { useFiltro } from "../../store/filtro";
import { useUi } from "../../store/ui";
import { linkRecorte } from "../../lib/recortes";
import { usePaineis } from "../../paineis/repo";
import { NovoPainelModal } from "../../paineis/NovoPainelModal";
import { SeletorCargo, SeletorEleicao } from "./Header";

export function Navbar() {
  const loc = useLocation();
  const { paineis } = usePaineis();
  const usuario = useAuth((s) => s.usuario);
  const f = useFiltro();
  const fechar = useUi((s) => s.setNavbar);
  const [novo, setNovo] = useState(false);
  const ativo = (p: string) => loc.pathname === p || loc.pathname.startsWith(p + "/");
  const item = (to: string, label: string, Icone: typeof IconMap2, extra?: React.ReactNode) => (
    <NavLink
      component={Link}
      to={to}
      label={label}
      leftSection={<Icone size={18} stroke={1.6} />}
      rightSection={extra}
      active={ativo(to.split("?")[0])}
      onClick={() => fechar(false)}
      style={{ borderRadius: 8 }}
    />
  );
  return (
    <>
      <ScrollArea h="100%" type="scroll" className="scroll-fino">
        <Stack gap={2} p="xs">
          <Stack gap="xs" hiddenFrom="sm" pb="sm" mb={4} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
            <SeletorEleicao largura="100%" />
            <SeletorCargo soSelect />
          </Stack>
          <Group justify="space-between" px={6} pt={4}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              Painéis
            </Text>
            <Tooltip label="Novo painel (templates)">
              <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={() => setNovo(true)}>
                Criar
              </Button>
            </Tooltip>
          </Group>
          {paineis.length === 0 && (
            <NavLink component={Link} to="/" label="Noite da eleição" description="template" leftSection={<IconLayoutDashboard size={18} stroke={1.6} />} active={loc.pathname === "/"} />
          )}
          {paineis.map((p) => (
            <NavLink
              key={p.id}
              component={Link}
              to={`/paineis/${p.id}`}
              label={p.nome}
              leftSection={<IconLayoutDashboard size={18} stroke={1.6} />}
              rightSection={p.padrao ? <IconStarFilled size={12} color="var(--mantine-color-yellow-5)" /> : undefined}
              active={loc.pathname === `/paineis/${p.id}` || (loc.pathname === "/" && p.padrao)}
              onClick={() => fechar(false)}
              style={{ borderRadius: 8 }}
            />
          ))}
          {item("/paineis", "Gerenciar painéis", IconLayoutGrid)}
          {item("/tv", "Modo TV", IconDeviceTv)}
          <Divider my={6} />
          {item(linkRecorte(f.nivel === "local" || f.nivel === "secao" ? "br" : f.nivel, f.nivel === "local" || f.nivel === "secao" ? "br" : f.id), "Explorar", IconCompass)}
          {item("/mapas", "Mapas", IconMap2)}
          {item("/candidatos", "Candidatos", IconUsers)}
          {item("/eventos", "Eventos", IconCalendarEvent, <Badge size="xs" variant="dot" color="red">ao vivo</Badge>)}
          {item("/alertas", "Alertas", IconBell)}
          <Divider my={6} />
          {item("/conta", "Preferências", IconSettings)}
          {usuario?.is_admin && item("/admin", "Admin", IconShieldLock)}
        </Stack>
      </ScrollArea>
      <NovoPainelModal aberto={novo} onClose={() => setNovo(false)} />
    </>
  );
}
