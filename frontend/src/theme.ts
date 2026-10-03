import { createTheme, rem, type MantineColorsTuple, type MantineThemeOverride } from "@mantine/core";

/** "Noite da eleição": fundo azul-ardósia profundo, superfícies #111A2E, bordas sutis. */
const dark: MantineColorsTuple = [
  "#D5DCEB", // 0 texto
  "#AEB8CE", // 1
  "#8592AD", // 2 texto secundário
  "#5D6A87", // 3
  "#26324D", // 4 bordas
  "#1A243C", // 5 hover
  "#111A2E", // 6 superfícies/cards
  "#0B1220", // 7 fundo
  "#080D18", // 8
  "#050911", // 9
];

const eleicao: MantineColorsTuple = [
  "#E8F0FF", "#CFDDFF", "#9DBAFF", "#6894FF", "#3D7BFF",
  "#2468FF", "#155CF5", "#064CDB", "#0043C4", "#0039AD",
];

export function criarTema(scale = 1): MantineThemeOverride {
  return createTheme({
    scale,
    primaryColor: "eleicao",
    primaryShade: { light: 6, dark: 4 },
    colors: { dark, eleicao },
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontFamilyMonospace: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    headings: { fontFamily: "Inter, system-ui, sans-serif", fontWeight: "700" },
    defaultRadius: "md",
    radius: { xs: rem(4), sm: rem(6), md: rem(9), lg: rem(12), xl: rem(18) },
    cursorType: "pointer",
    components: {
      Card: { defaultProps: { radius: "lg", withBorder: true, shadow: "sm" } },
      Paper: { defaultProps: { radius: "lg" } },
      Badge: { defaultProps: { radius: "sm" } },
      Tooltip: { defaultProps: { withArrow: true, openDelay: 150, multiline: true, maw: 320 } },
      Drawer: { defaultProps: { overlayProps: { backgroundOpacity: 0.35, blur: 2 } } },
      Modal: { defaultProps: { overlayProps: { backgroundOpacity: 0.45, blur: 3 }, radius: "lg" } },
      SegmentedControl: { defaultProps: { radius: "md" } },
    },
    other: {
      numFont: "'JetBrains Mono', ui-monospace, monospace",
    },
  });
}
