# 9. Frontend: React + Vite

## 9.1 Bibliotecas (componentes prontos)

| Necessidade | Biblioteca | Por quê |
|---|---|---|
| Base | **React 18 + TypeScript + Vite** | Stack definida |
| Componentes de UI | **Mantine v7** (`@mantine/core`, `hooks`, `dates`, `notifications`, `modals`, `spotlight`, `dropzone`) | Biblioteca completa e bonita de fábrica, com tema claro/escuro, AppShell, Drawer, SegmentedControl, Slider, Badge, Progress, RingProgress, Spotlight (Ctrl+K) e notificações |
| Ícones | `@tabler/icons-react` | Padrão do Mantine |
| Tabelas | **mantine-react-table** (TanStack Table) | Ordenação, filtros, colunas configuráveis, virtualização e export |
| Gráficos | **Apache ECharts** (`echarts-for-react`) | Animações de transição, bar race, linhas com marcadores de evento, rosca, hemiciclo (pictorialBar/pie custom), heatmap |
| Gráficos simples | `@mantine/charts` (Recharts) | Sparklines e mini-gráficos dentro de cards |
| Mapas | **MapLibre GL** (`react-map-gl/maplibre`) + **deck.gl** (`GeoJsonLayer`, `ScatterplotLayer`, `H3HexagonLayer`/`HexagonLayer`, `TextLayer`) | Vetorial, rápido com 5.570 municípios e ~100 mil locais, sem API key |
| Mapa base | Estilo vetorial gratuito (OpenFreeMap "positron"/"dark") | Sem chave |
| Topologia | `topojson-client` | Malhas leves vindas da API |
| Dashboard em grade | **react-grid-layout** (Responsive) | Arrastar e redimensionar, com layouts por breakpoint |
| Dados do servidor | **TanStack Query** | Cache, refetch e integração com os diffs do WebSocket |
| Estado do cliente | **Zustand** (+ `persist`) | Filtro global, tempo T, painéis offline, preferências |
| Rotas | **React Router v6** (data router) | |
| Formulários | `@mantine/form` + **zod** | Configuração de widgets e alertas |
| Números animados | **@number-flow/react** | Contadores que "rolam" até o novo valor |
| Animações | **motion** (Framer Motion) | Reordenação animada do ranking e entrada de eventos |
| Datas | **dayjs** (com timezone `America/Sao_Paulo`) | Exibição em horário de Brasília |
| Exportar imagem | `html-to-image` | PNG/SVG do widget |
| Planilha | `xlsx` (SheetJS) | Export XLSX no cliente |

O frontend **não terá testes automatizados** (decisão do projeto). A
qualidade é garantida por TypeScript `strict`, ESLint e Prettier.

## 9.2 Direção visual ("bem bonito")

- **Tema "Noite da eleição"**: escuro por padrão (fundo azul-ardósia
  profundo `#0B1220`, superfícies `#111A2E`, bordas sutis) e tema claro
  completo. Alternância com animação.
- **Tipografia**: Inter (texto) e **JetBrains Mono / tabular-nums** para
  números, que assim não "pulam" quando mudam.
- **Cores dos candidatos**: paleta categórica neutra de 12 cores, validada
  para contraste e daltonismo, atribuída pela ordem do número do candidato.
  O usuário pode trocar a cor de cada candidato nas preferências. Selos de
  situação têm cores semânticas fixas (verde = eleito, âmbar = 2º turno,
  azul = liderando, cinza = suplente/não eleito).
- **Cards** com cantos arredondados (12 px), sombra suave, cabeçalho com
  título, um chip do recorte e do tempo, e um menu (⋯) com configurar,
  duplicar, exportar e remover.
- **Microinterações**: números que rolam ao mudar, barras que deslizam,
  ranking que reordena com animação, *glow* breve na célula alterada, ponto
  "AO VIVO" pulsante e skeletons durante o carregamento.
- **Densidade** confortável ou compacta e **modo TV** com fontes grandes.
- Totalmente responsivo: no celular a grade vira uma coluna e o mapa ocupa
  a tela inteira com bottom sheet.

## 9.3 Estrutura de telas

```
AppShell
├── Header: logo · seletor de eleição/turno/ambiente · seletor de cargo (SegmentedControl)
│           · busca global (Spotlight, Ctrl+K) · indicador AO VIVO · tema · usuário
├── Navbar (recolhível): Painéis (lista + criar) · Explorar · Mapas · Candidatos · Eventos · Admin
├── Barra de filtro global: breadcrumb (Brasil › SP › Campinas › Zona 33 › EE Fulano › Seção 120)
│                          · filtros · chip de tempo
├── Conteúdo
└── Rodapé fixo: SLIDER DE TEMPO (linha do tempo com marcadores de eventos, play/pausa,
                 velocidade, botão "AO VIVO")
```

Páginas:

| Rota | Conteúdo |
|---|---|
| `/` | Painel padrão do usuário (ou o template "Noite da eleição") |
| `/paineis/:id` | Painel personalizável (modo visualizar/editar) |
| `/p/:token` | Painel compartilhado (somente leitura) |
| `/explorar/:nivel/:id?cargo=` | Página de recorte gerada automaticamente: bloco de totais, ranking, mapa dos filhos, tabela dos filhos, evolução |
| `/mapas` | Mapa em tela cheia com seletor de tipo de mapa (RF-05) e painel lateral |
| `/locais/:id` | Local de votação: mapa, seções (com status), resultado agregado |
| `/secoes/:uf/:mun/:zona/:secao` | Seção: BU decodificado, horário, hash, assinatura |
| `/candidatos/:sqcand` | Card do candidato e desempenho por região (mapa + tabela) |
| `/eventos` | Feed completo com filtros |
| `/admin` | Saúde do coletor |
| `/entrar`, `/conta` | Login e preferências |

## 9.4 Placar e bloco de totais (votos válidos + eleito)

```
┌───────────────────────────────────────────────────────────────┐
│ PRESIDENTE · BRASIL                    ● AO VIVO 21:14:32 BRT  │
│ ████████████████████░░░░  87,42% das seções apuradas           │
│                                                                │
│  VOTOS VÁLIDOS          BRANCOS      NULOS      ABSTENÇÃO      │
│  112.345.678            1,9%         3,1%       20,4%          │
│  (95,0% do comparec.)                                          │
├────────────────────────────────────────────────────────────────┤
│ (foto) 13 FULANO DE TAL   [✓ ELEITO]                           │
│        PARTIDO X · 51,23%  ██████████████████████▏ 57.551.234  │
│ (foto) 22 BELTRANO        [NÃO ELEITO]                         │
│        PARTIDO Y · 44,10%  ███████████████████▏    49.544.311  │
│   … diferença: 7,13 p.p. (8.006.923 votos)                     │
└────────────────────────────────────────────────────────────────┘
```

- **Votos válidos** é o número de maior destaque do bloco.
- Selos de situação conforme o RF-03, com tooltip explicando a origem
  ("Situação publicada pelo TSE às 20:31").
- Proporcionais: abas "Candidatos" e "Partidos/Federações", com hemiciclo de
  vagas e o toggle "só eleitos".

## 9.5 Mapas

Componente `<MapaEleitoral tipo nivel pai cargo t />`, que pode ser usado
como widget ou em tela cheia.

| Tipo | Camadas deck.gl | Cor |
|---|---|---|
| Vencedores | `GeoJsonLayer` (UF/município) + `ScatterplotLayer` (locais, quando dentro de um município) | Cor do líder, opacidade proporcional à margem (5 faixas) |
| Desempenho de candidato | `GeoJsonLayer` | Escala sequencial (0–100%) |
| Comparativo A × B | `GeoJsonLayer` | Escala divergente em p.p. |
| Progresso da apuração | `GeoJsonLayer` | Sequencial de % de seções apuradas. Municípios sem dados ficam hachurados |
| **Locais apurados** | `ScatterplotLayer` (zoom alto) / `HexagonLayer` (zoom baixo) | Cinza = não recebido, âmbar = parcial, verde = 100% apurado. Hexágono com % de locais apurados |
| Comparecimento | `GeoJsonLayer` | Sequencial |
| Partido mais votado (proporcional) | `GeoJsonLayer` | Cor do partido |

Comportamento:
- **Hover**: tooltip com nome, líder, margem, % apurado e votos válidos.
- **Clique**: desce o nível (UF → municípios da UF → locais do município) e
  atualiza o breadcrumb e o filtro global (se o widget herda).
- **Legenda** interativa: clicar em um candidato destaca só as regiões que
  ele venceu e mostra a contagem ("venceu em 14 UFs / 3.102 municípios").
- **Tempo**: com o slider, o mapa interpola as cores. No replay, o mapa
  "pinta" ao longo da noite.
- Atualização ao vivo: só as feições alteradas são recoloridas (diff por id).
- Mini-mapa de inserção para DF e para o Exterior.

## 9.6 Personalização (editor de painel)

- Botão **"Editar painel"** ativa o modo edição: a grade mostra guias, cada
  widget ganha alças de arrastar e redimensionar, e abre a **gaveta "Adicionar
  widget"** com o catálogo (RF-08), com preview e busca.
- Clicar em um widget abre a **gaveta de configuração**: fonte (herdar filtro
  global ou fixar eleição/cargo/recorte/tempo), aparência (título, tipo de
  gráfico, cores, top N, colunas) e comportamento (clique navega / clique
  filtra o painel).
- **Interação entre widgets**: um clique no mapa ou na tabela pode atualizar
  o filtro global (cross-filtering) e todos os widgets que herdam reagem.
- Desfazer/refazer (Ctrl+Z/Ctrl+Shift+Z) durante a edição. Salvamento
  automático (debounce) no backend, ou no localStorage sem login.
- Menu do painel: renomear, duplicar, definir como padrão, compartilhar
  (link público "ao vivo" ou "congelado em T"), exportar/importar JSON, modo
  TV, apagar.
- Galeria de **templates** ao criar um painel novo.
- O esquema do painel é validado com zod e versionado (`schemaVersion`) para
  migrações futuras.

## 9.7 Tempo real no cliente

- Hook `useLive(topicos)`: um único WebSocket por aba, com assinatura e
  cancelamento por referência (vários widgets no mesmo tópico compartilham a
  assinatura).
- Os diffs recebidos são aplicados direto no cache do TanStack Query
  (`setQueryData`), sem refetch.
- Reconexão com backoff, envio de `resume` com o último `seq` e banner
  "Reconectando…" quando cai.
- Quando T ≠ "agora", o painel para de aplicar os diffs (mas continua
  recebendo eventos para o badge "N novidades — voltar ao vivo").
- Eventos geram toasts conforme as preferências e o push do navegador para
  alertas (RF-09).
- Formatação sempre em pt-BR (`Intl.NumberFormat('pt-BR')`) e horário de
  Brasília.

## 9.8 Estrutura de pastas

```
frontend/
├── index.html
├── vite.config.ts            # proxy /api e /ws para a api em dev
├── src/
│   ├── main.tsx, App.tsx, theme.ts (tema Mantine claro/escuro, tokens de cor)
│   ├── api/                  # cliente HTTP tipado, tipos gerados do OpenAPI (openapi-typescript)
│   ├── realtime/             # WebSocket, useLive, aplicação de diffs
│   ├── store/                # zustand: filtroGlobal, tempo, paineis (offline), preferencias
│   ├── components/
│   │   ├── layout/           # AppShell, Header, Breadcrumb, TimeSlider, LiveIndicator
│   │   ├── resultados/       # Placar, BlocoTotais, SeloSituacao, CardCandidato, Hemiciclo
│   │   ├── mapas/            # MapaEleitoral, camadas, Legenda, Tooltip
│   │   ├── graficos/         # Evolucao, Rosca, HeatmapProgresso, Comparativo
│   │   └── tabelas/          # TabelaRecortes
│   ├── widgets/              # registro do catálogo: { tipo, componente, configSchema, defaults }
│   ├── paineis/              # Grade, EditorPainel, GavetaWidgets, GavetaConfig, templates/
│   ├── pages/
│   └── lib/                  # formatação, cores, geo
└── Dockerfile                # build Vite → nginx
```

Os tipos da API são **gerados do OpenAPI do FastAPI** (`openapi-typescript`),
para manter o front e o back alinhados sem testes no front.
