import {
  ActionIcon,
  Box,
  Burger,
  Group,
  SegmentedControl,
  Select,
  Text,
  Tooltip,
  useComputedColorScheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconChartBar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMoonStars,
  IconSun,
} from "@tabler/icons-react";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useElections } from "../../results";
import { OFFICE_OPTIONS, officeForState, officesOfRound, segmentValue } from "../../../lib/offices";
import { stateOfId } from "../../../lib/geo-areas";
import { useFilter } from "../../../lib/filter-store";
import { usePrefs } from "../../../lib/prefs-store";
import { useDesktopNav, useUi } from "../../../lib/ui-store";
import { Search } from "./Search";
import { LiveIndicator } from "./LiveIndicator";
import { UserMenu } from "../../accounts";

export function ElectionSelector({ largura = 158 }: { largura?: number | string }) {
  const el = useElections();
  const { ciclo, turno, setFiltro } = useFilter();
  const opcoes = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of el.data ?? []) {
      const c = e.cycle ?? "ele2026";
      const ano = c.replace(/\D/g, "") || "2026";
      m.set(`${c}|${e.round}`, `${ano} · ${e.round}º turno`);
    }
    if (!m.size) {
      m.set("ele2026|1", "2026 · 1º turno");
      m.set("ele2026|2", "2026 · 2º turno");
    }
    return [...m.entries()].map(([value, label]) => ({ value, label }));
  }, [el.data]);
  const valor =
    opcoes.find((o) => o.value === `${ciclo ?? "ele2026"}|${turno}`)?.value ??
    opcoes.find((o) => o.value.endsWith(`|${turno}`))?.value ??
    null;
  return (
    <Select
      size="sm"
      w={largura}
      data={opcoes}
      value={valor}
      onChange={(v) => {
        if (!v) return;
        const [c, tn] = v.split("|");
        setFiltro({ ciclo: c, turno: Number(tn) });
      }}
      allowDeselect={false}
      aria-label="Eleição e turno"
      comboboxProps={{ withinPortal: true }}
    />
  );
}

export function OfficeSelector({ soSelect }: { soSelect?: boolean }) {
  const el = useElections();
  const { cargo, turno, ciclo, nivel, id, setFiltro } = useFilter();
  const disponiveis = officesOfRound(el.data, turno, ciclo).map((c) => Number(c.office_code));
  const opcoes = OFFICE_OPTIONS.map((o) => ({
    value: o.valor,
    label: o.rotulo,
    disabled: disponiveis.length > 0 && !o.cds.some((cd) => disponiveis.includes(cd)),
  }));
  // se o cargo atual não existe no turno (ex.: 2º turno), volta para o primeiro disponível
  useEffect(() => {
    if (
      disponiveis.length &&
      !disponiveis.includes(cargo) &&
      !(cargo === 7 && disponiveis.includes(8)) &&
      !(cargo === 8 && disponiveis.includes(7))
    ) {
      setFiltro({ cargo: disponiveis[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disponiveis.join(","), cargo]);
  const trocar = (v: string) => {
    const cd = Number(v);
    const uf = stateOfId(nivel, id);
    const novo = officeForState(cd, uf);
    // exterior só existe para Presidente: mantém o recorte quando faz sentido
    if (uf === "zz" && novo !== 1) setFiltro({ cargo: novo, nivel: "country", id: "br", nome: "Brasil" });
    else setFiltro({ cargo: novo });
  };
  if (soSelect)
    return (
      <Select
        size="sm"
        label="Cargo"
        value={segmentValue(cargo)}
        onChange={(v) => v && trocar(v)}
        data={opcoes}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
    );
  return (
    <>
      <SegmentedControl
        size="sm"
        value={segmentValue(cargo)}
        onChange={trocar}
        data={opcoes}
        visibleFrom="xl"
        aria-label="Cargo"
      />
      <Select
        size="sm"
        w={170}
        value={segmentValue(cargo)}
        onChange={(v) => v && trocar(v)}
        data={opcoes}
        hiddenFrom="xl"
        allowDeselect={false}
        aria-label="Cargo"
        comboboxProps={{ withinPortal: true }}
        visibleFrom="sm"
      />
    </>
  );
}

export function Header() {
  const navbarAberta = useUi((s) => s.navbarAberta);
  const toggleNavbar = useUi((s) => s.toggleNavbar);
  const nav = useDesktopNav();
  const tema = usePrefs((s) => s.tema);
  const setPrefs = usePrefs((s) => s.set);
  const esquema = useComputedColorScheme("dark");
  const celular = useMediaQuery("(max-width: 48em)");
  return (
    <Group h="100%" px={{ base: "xs", sm: "md" }} justify="space-between" wrap="nowrap" gap="xs">
      <Group gap="xs" wrap="nowrap">
        <Burger
          opened={navbarAberta}
          onClick={toggleNavbar}
          hiddenFrom="sm"
          size="sm"
          aria-label="Abrir menu"
        />
        <Tooltip label={nav.aberta ? "Recolher menu" : "Expandir menu"}>
          <ActionIcon
            variant="subtle"
            onClick={nav.toggle}
            visibleFrom="sm"
            aria-label="Alternar menu lateral"
          >
            {nav.aberta ? (
              <IconLayoutSidebarLeftCollapse size={18} />
            ) : (
              <IconLayoutSidebarLeftExpand size={18} />
            )}
          </ActionIcon>
        </Tooltip>
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
        <Box visibleFrom="sm">
          <ElectionSelector />
        </Box>
        <OfficeSelector />
      </Group>
      <Group gap="xs" wrap="nowrap">
        <Search />
        <LiveIndicator compacto={celular} />
        <Tooltip label={esquema === "dark" ? "Tema claro" : "Tema escuro (noite da eleição)"}>
          <ActionIcon
            variant="default"
            size="lg"
            onClick={() => setPrefs({ tema: esquema === "dark" ? "claro" : "escuro" })}
            aria-label="Alternar tema"
            data-tema={tema}
          >
            {esquema === "dark" ? <IconSun size={18} /> : <IconMoonStars size={18} />}
          </ActionIcon>
        </Tooltip>
        <UserMenu />
      </Group>
    </Group>
  );
}
