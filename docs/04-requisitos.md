# 4. Requisitos do produto (sistema completo)

Este documento descreve o **sistema completo**. Não há corte de MVP: tudo o
que está aqui faz parte da entrega. A ordem de construção está no
[doc 07](07-roadmap-riscos.md).

## 4.1 Personas

- **Acompanhador intenso** (o dono do projeto): quer ver tudo ao mesmo tempo,
  montar painéis próprios, comparar regiões e ver a evolução minuto a minuto.
- **Analista / jornalista**: quer descer até zona, local e seção, exportar
  dados e verificar a origem (assinatura TSE, horário do snapshot).
- **Espectador**: abre um painel compartilhado e acompanha.

## 4.2 Requisitos funcionais

### RF-01: Seleção de eleição
- Escolher **ano/ciclo**, **turno** e **ambiente** (Oficial / Simulado /
  Histórico 2022 / Replay).
- A lista é montada a partir do catálogo EA11, sem nada fixo no código.

### RF-02: Cargos
- Presidente, Governador, Senador, Deputado Federal, Deputado Estadual e
  Deputado Distrital.
- **Majoritários**: ranking com votos, % dos válidos, diferença em **pontos
  percentuais (p.p.)** para o próximo colocado e para os 50% + 1, situação e
  indicador de "matematicamente definido".
- **Senador**: em 2026 são **2 vagas** por UF. O destaque de "eleito" vale
  para os dois primeiros.
- **Proporcionais**: ranking de candidatos, **vagas por partido/federação**
  (`vag`), situação (eleito por QP, eleito por média, suplente, não eleito),
  votos de legenda e filtro por partido ou federação.

### RF-03: Votos válidos e situação do candidato (obrigatório em todo placar)

Todo recorte (Brasil, UF, município, zona, local, seção) mostra um **bloco de
totais**:

| Indicador | Origem | Exibição |
|---|---|---|
| **Votos válidos** | `v.vv` (EA20), ou soma dos votos nominais + legenda no BU | Número absoluto **em destaque** + % sobre o comparecimento |
| Votos totais | `v.tv` | Absoluto |
| Brancos / Nulos | `v.vb` / `v.vn` (ou `tvn`) | Absoluto + % sobre o total |
| Comparecimento / Abstenção | `e.c` / `e.a` | Absoluto + % sobre o eleitorado |
| Seções totalizadas | `s.st` / `s.ts` | Barra de progresso + % (`pstn`) |
| Eleitorado apurado | `e.est` / `e.te` | Absoluto + % |

Cada candidato mostra **votos**, **% dos válidos** e um **selo de situação**:

| Selo | Quando | Cor |
|---|---|---|
| **ELEITO** | O TSE marca `e = "s"` ou `st` = "Eleito", "Eleito por QP" ou "Eleito por média" | Verde, com ícone ✓ |
| **2º TURNO** | `st` = "2º turno" | Âmbar |
| **Matematicamente eleito** | `md` indica definição antes de 100% apurado | Verde contornado |
| **Liderando** | Apuração em andamento e candidato em 1º (ou entre os N primeiros com N = vagas) | Azul |
| **Suplente** | `st` = "Suplente" | Cinza |
| **Não eleito** | `st` = "Não eleito" após a totalização | Cinza claro |
| **Sub judice / Anulado** | `dvt` diferente de "Válido" | Vermelho contornado, com tooltip explicando |

Regras:
- **A situação de eleito vem sempre do TSE.** O sistema não declara eleito
  por conta própria. "Liderando" é o único selo calculado por nós e fica
  claramente diferente de "Eleito".
- Nos níveis abaixo da abrangência do cargo (ex.: Presidente em um
  município), o selo mostra a situação **geral** do candidato ("ELEITO no
  Brasil") e o ranking local mostra quem "venceu neste recorte".
- Um filtro "**mostrar só eleitos**" está disponível em todos os rankings e
  tabelas.

### RF-04: Granularidade (drill-down completo)
- Níveis: **Brasil → UF → Município → Zona → Local de votação ("colégio") →
  Seção**, e também **Exterior (ZZ)** para Presidente.
- Navegação por **mapa** (clicar desce um nível), por **breadcrumb** e por
  **busca global** (Ctrl+K): município, zona ("zona 1 SP"), seção, nome da
  escola, bairro, endereço, candidato (nome ou número) e partido.
- Ao trocar o cargo, o recorte é mantido quando faz sentido.
- Cada nível mostra o bloco de totais (RF-03), o ranking, o mapa dos filhos e
  a tabela dos filhos (ex.: no município, a tabela de zonas e locais com
  vencedor, margem e % apurado).
- Nos níveis de local e seção: **cobertura** ("12 de 15 seções deste local
  coletadas"), horário do BU, hash e status da assinatura, e link para o
  arquivo bruto do TSE.
- **Filtros combináveis** em qualquer tabela de recortes: UF, faixa de % 
  apurado, vencedor, margem mínima/máxima, tamanho do eleitorado,
  capital/interior e região (Norte, Nordeste, Centro-Oeste, Sudeste, Sul).
- **Agrupamentos**: por região geográfica, por UF, por porte de município e
  por zona.

### RF-05: Mapas

Todos os mapas são interativos (zoom, hover com tooltip, clique para descer)
e respeitam o tempo T selecionado.

1. **Mapa de vencedores** (coroplético): cada UF ou município é colorido com
   a cor do candidato que lidera ali. A **intensidade** da cor é a margem de
   vitória. Serve para responder "em que região cada candidato ganhou".
   - Níveis: UF, município e, dentro de um município, **pontos dos locais de
     votação** coloridos pelo vencedor do local.
   - Legenda com a contagem de UFs e municípios vencidos por candidato.
2. **Mapa de desempenho de um candidato**: % de votos de **um** candidato
   escolhido, em escala sequencial. Também há um modo **comparativo**
   (diferença em p.p. entre dois candidatos, escala divergente).
3. **Mapa de progresso da apuração**: % de seções totalizadas por UF e por
   município, em escala sequencial. Responde "onde já foi contado".
4. **Mapa de locais apurados**: cada **local de votação** é um ponto com cor
   por status (**não recebido**, **parcial**, **100% apurado**). Em zoom
   baixo vira cluster/hexbin com a % de locais apurados. Responde "em quais
   locais já foram contados votos".
5. **Mapa de comparecimento/abstenção** por município.
6. **Mapa de vagas** (proporcionais): partido mais votado por município.
7. **Linha do tempo no mapa**: com o slider (RF-07) ou em replay, o mapa
   "pinta" conforme a apuração avança.

### RF-06: Tempo real
- Atualização automática **sem recarregar a página**, via WebSocket.
  Atraso alvo entre o TSE publicar e a tela mudar: **≤ 10 s** para BR/UF e
  **≤ 60 s** para município e zona.
- Indicador "AO VIVO" pulsante, com horário da última totalização (`dt`/`ht`)
  e da última verificação. Se o dado ficar velho, aparece "Desatualizado há
  X min".
- Animações: números contam até o novo valor, barras deslizam, o ranking
  reordena com animação e a célula que mudou pisca.
- **Feed de eventos** em tempo real: virada de liderança, marcos de apuração
  (10/25/50/75/90/100%), candidato eleito, 2º turno definido e UF ou
  município finalizado.
- **Notificações** (toast e push do navegador) para eventos escolhidos pelo
  usuário.
- Reconexão automática, com recuperação do que foi perdido enquanto estava
  desconectado (o cliente informa o último `seq` recebido).

### RF-07: Linha do tempo ("máquina do tempo")
- Cada nova geração (`idg`) de cada arquivo é **gravada como snapshot**.
- **Slider global de tempo**: todos os widgets passam a mostrar o estado
  "como estava às 19h42". O botão "AO VIVO" volta ao tempo real.
- **Replay** a 1×, 10×, 60× e 300×, com play, pausa e saltos para eventos.
- Gráficos de evolução: % de cada candidato × % de seções apuradas, votos ×
  horário, e diferença entre os 2 primeiros × horário. Os eventos de virada
  aparecem marcados.
- Comparação "agora vs. há N minutos" (delta em votos e em p.p.).
- Para seções e locais, o eixo do tempo é o horário de totalização do BU.

### RF-08: Personalização (dashboard montável)
- **Painéis** em grade, com widgets **arrastáveis e redimensionáveis**
  (layouts separados para desktop, tablet e celular).
- **Filtro global** do painel (eleição, turno, cargo, recorte, tempo). Cada
  widget **herda** esse filtro ou define o seu próprio, com um ícone de
  "cadeado" indicando que está fixo.
- **Catálogo de widgets**:
  1. Placar de candidatos (barras, com selos de situação)
  2. Bloco de totais (válidos, brancos, nulos, comparecimento, % apurado)
  3. KPI único (número grande com variação)
  4. Mapa (os 7 tipos do RF-05)
  5. Gráfico de evolução temporal (linha/área)
  6. Tabela de recortes (filtrável, ordenável, com mini-barras)
  7. Comparativo lado a lado (2 a 4 recortes ou candidatos)
  8. Hemiciclo / vagas por partido
  9. Pizza/rosca de distribuição de votos
  10. Heatmap de progresso por UF
  11. Feed de eventos
  12. Card de candidato (foto, número, partido, vice/suplentes, votos, selo)
  13. Detalhe de local de votação (mini-mapa + lista de seções)
  14. Detalhe de seção (BU)
  15. Contador regressivo / relógio de Brasília
  16. Texto/anotação (markdown)
- Configuração por widget: título, cores, mostrar/ocultar colunas, top N,
  ordenação, escala (absoluto/%), estilo do gráfico e intervalo de tempo.
- **Painéis múltiplos** por usuário: criar, duplicar, renomear, reordenar,
  definir como padrão, **exportar/importar em JSON**.
- **Templates prontos**: "Noite da eleição – Presidente", "Meu estado",
  "Minha cidade", "Meu colégio", "Câmara dos Deputados", "Senado 2026",
  "Comparativo 2022 × 2026".
- **Favoritos**: candidatos e recortes fixados em uma barra rápida.
- **Preferências**: tema claro/escuro/automático, cor por candidato (com
  paleta neutra padrão), densidade (confortável/compacta), formato de número,
  animações on/off.
- **Modo TV**: tela cheia, rotação automática entre painéis e fonte grande.
- **Compartilhar**: link público somente leitura de um painel, com opção de
  "seguir ao vivo" ou "congelado no tempo T".
- **Contas**: login por e-mail e senha (JWT). Sem login, os painéis ficam
  salvos no navegador e podem ser migrados para a conta depois.

### RF-09: Alertas
- Regras configuráveis: "quando X passar Y%", "quando houver virada em Z",
  "quando a apuração de UF chegar a N%", "quando o candidato for eleito" e
  "quando a seção/local X for apurado".
- Canais: toast no app e push do navegador.

### RF-10: Exportação e transparência
- Exportar os dados do widget (CSV/JSON/XLSX) e a imagem (PNG/SVG).
- Cada número mostra, por tooltip ou rodapé, **a fonte** (arquivo TSE, `idg`,
  horário) e se a **assinatura JWS foi verificada**.

### RF-11: Pós-eleição e comparativos
- Carga dos dados consolidados dos Dados Abertos para completar 100% das
  seções.
- Comparativo **2022 × 2026** por recorte: variação de votos do partido e
  "trocou de lado" no mapa.

### RF-12: Administração
- Página de saúde (somente admin): req/s ao TSE, taxas de 200/304/404/403,
  atraso de ingestão, filas do coletor, falhas de JWS e cobertura de seções.
- Botões para pausar o coletor, mudar ambiente (simulado/oficial) e
  reprocessar arquivos brutos.

## 4.3 Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **Nunca** ultrapassar os limites do TSE: teto configurável (padrão 60 req/s por IP), ETag obrigatório, nenhum 404 especulativo |
| RNF-02 | Os clientes nunca acessam o TSE. Só o coletor fala com o TSE |
| RNF-03 | Suportar **10 mil usuários simultâneos** no pico, com fan-out via WebSocket + Redis pub/sub e cache HTTP curto |
| RNF-04 | Resiliência: se o TSE ficar fora, mostrar o último dado com aviso de desatualizado. Backoff exponencial no coletor |
| RNF-05 | Integridade: verificar a assinatura JWS antes de persistir e registrar o resultado |
| RNF-06 | Testável sem eleição: serviço **tse-fake** (replay) com a mesma estrutura de URLs do TSE |
| RNF-07 | Responsivo (desktop, tablet, celular), acessível (contraste AA, leitores de tela nos placares, navegação por teclado) |
| RNF-08 | Tudo armazenado em UTC e exibido em **horário de Brasília** |
| RNF-09 | Neutralidade: paleta padrão sem associação ideológica e projeções sempre rotuladas como estimativa |
| RNF-10 | **Tudo sobe com `docker compose up`** (ver [doc 10](10-docker.md)) |
| RNF-11 | **Testes automatizados somente no backend** (pytest), com cobertura mínima de 85% nos módulos de domínio, parser e API (ver [doc 08](08-backend.md)). O frontend não terá testes automatizados |
| RNF-12 | Performance de tela: primeira renderização do painel < 2 s, mapa de municípios com interação a 60 fps |

## 4.4 Critérios de aceite (amostra)

- Dado um snapshot gravado do simulado, ao mover o slider para T, todos os
  widgets exibem os valores do snapshot com `totalizado_em` ≤ T mais recente.
- Todo placar exibe **votos válidos** em destaque e cada candidato tem selo
  de situação. Um candidato com `e = "s"` no EA20 aparece como **ELEITO**.
- No mapa de vencedores por município, cada município tem a cor do líder e o
  tooltip mostra líder, margem, % apurado e votos válidos.
- No mapa de locais apurados, um local com todas as seções com BU coletado
  aparece como "100% apurado". Com parte delas, aparece como "parcial".
- Com o coletor rodando contra o tse-fake, o tráfego nunca passa do teto e
  nenhuma URL 404 é requisitada mais de uma vez por ciclo de catálogo.
- Ao alterar 1 byte de um JWS, o coletor rejeita o snapshot e registra alerta.
- Um painel criado sem login, exportado em JSON e importado em outra máquina
  fica idêntico.
