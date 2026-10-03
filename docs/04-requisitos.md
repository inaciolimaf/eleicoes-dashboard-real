# 4. Requisitos do produto

## 4.1 Personas

- **Acompanhador intenso** (o dono do projeto): quer ver tudo ao mesmo tempo,
  montar painéis próprios, comparar regiões e ver a evolução minuto a minuto.
- **Analista / jornalista**: quer descer até zona, local e seção, exportar
  dados e verificar a origem (assinatura TSE, horário do snapshot).
- **Espectador** (secundário): abre um painel compartilhado e acompanha.

## 4.2 Requisitos funcionais

### RF-01: Seleção de eleição
- Escolher **ano/ciclo**, **turno** e **ambiente** (Oficial / Simulado /
  Histórico 2022 para testes e replay).
- A lista é montada a partir do catálogo EA11, sem nada fixo no código.

### RF-02: Cargos
- Presidente, Governador, Senador, Deputado Federal, Deputado Estadual,
  Deputado Distrital.
- Majoritários: ranking de candidatos com votos, % dos válidos, diferença em
  **pontos percentuais** para o próximo colocado, situação (eleito / 2º turno)
  e indicador de "matematicamente definido".
- Senador: destacar que em 2026 são **2 vagas** por UF.
- Proporcionais: ranking de candidatos, **vagas por partido/federação**
  (`vag`), situação (eleito por QP, por média, suplente) e filtro por partido.

### RF-03: Recorte geográfico (drill-down)
- Brasil → UF → Município → Zona → **Local de votação** → **Seção**.
- Navegação por **mapa** (clique na UF ou no município) e por **busca** (nome
  do município, nome da escola, bairro, número da zona ou da seção).
- Breadcrumb sempre visível. Ao trocar o cargo, o recorte é mantido quando
  faz sentido (ex.: Presidente em SP → Governador em SP).
- Cada nível mostra: % de seções totalizadas, eleitorado, comparecimento,
  abstenção, brancos, nulos e votos por candidato.
- Nos níveis de local e seção: indicar a **cobertura** ("12 de 15 seções
  deste local coletadas") e o horário do BU.

### RF-04: Tempo real
- Atualização automática **sem recarregar a página**. Atraso alvo entre o TSE
  publicar e o usuário ver: **≤ 15 s** para BR/UF e **≤ 60 s** para
  município/zona.
- Indicador "ao vivo", com horário da última totalização (`dt`/`ht`) e da
  última verificação.
- Destaque visual de mudanças: número que mudou pisca, **virada de líder**
  vira evento destacado e há um feed de eventos ("SP passou de 80% apurado",
  "Fulano assumiu a liderança em MG").
- Notificações opcionais (browser push) para eventos escolhidos.

### RF-05: Linha do tempo e filtro por tempo ("máquina do tempo")
- Cada nova geração (`idg`) de cada arquivo é **gravada como snapshot**.
- **Slider de tempo**: o usuário arrasta e o dashboard inteiro mostra o estado
  "como estava às 19h42". Também tem modo **replay** com velocidade 1×, 10× e
  60×.
- Gráficos de evolução: % de cada candidato × % de seções apuradas, e votos
  absolutos × horário. Os eventos de virada aparecem marcados.
- Comparação "agora vs. há N minutos" (delta em votos e em p.p.).
- O filtro por tempo vale para qualquer recorte que tenha snapshots. Para
  seções, o "tempo" é o horário de totalização do BU.

### RF-06: Dashboard personalizável
- Grade de **widgets** arrastáveis e redimensionáveis.
- Cada widget tem sua própria configuração de eleição, cargo, recorte e
  janela de tempo, ou herda o **filtro global** do painel.
- Catálogo de widgets (v1):
  1. Placar de candidatos (barras horizontais)
  2. Cartões de KPI (% apurado, comparecimento, abstenção, brancos, nulos)
  3. Mapa coroplético (líder por UF/município, ou % de um candidato, ou % apurado)
  4. Gráfico de evolução temporal
  5. Tabela de recortes (ex.: municípios de uma UF com o líder de cada um), ordenável e filtrável
  6. Comparativo lado a lado (2 a 4 recortes ou candidatos)
  7. Vagas por partido (hemiciclo / barras) para proporcionais
  8. Feed de eventos
  9. Progresso da apuração por UF (heatmap)
  10. Detalhe de local de votação / seção (com mapa e lista de seções)
- Salvar vários painéis, duplicar e renomear. Compartilhar por link
  (somente leitura).
- Templates prontos: "Noite da eleição – Presidente", "Meu estado",
  "Minha cidade", "Câmara dos Deputados".
- Tema claro/escuro e modo "TV" (tela cheia, rotação automática de painéis).

### RF-07: Favoritos e alertas
- Favoritar candidatos e recortes. Os favoritos aparecem fixados.
- Regras de alerta: "quando X passar Y%", "quando houver virada em Z", "quando
  apuração de UF chegar a N%".

### RF-08: Exportação e transparência
- Exportar dados do widget (CSV/JSON) e imagem (PNG).
- Cada número mostra, via tooltip ou rodapé, **a fonte** (arquivo TSE, `idg`,
  horário) e se a **assinatura JWS foi verificada**.

### RF-09: Pós-eleição
- Depois que a totalização terminar, carregar os dados consolidados dos Dados
  Abertos e permitir análise histórica (comparar 2022 × 2026 por município).

## 4.3 Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **Nunca** ultrapassar os limites do TSE: teto configurável (padrão 60 req/s por IP), uso obrigatório de ETag e nenhum 404 especulativo |
| RNF-02 | Os clientes nunca acessam o TSE. Só o coletor fala com o TSE |
| RNF-03 | Suportar **10 mil usuários simultâneos** no pico (noite da eleição) com fan-out por WebSocket/SSE e cache na borda |
| RNF-04 | Resiliência: se o TSE ficar fora, mostrar o último dado com o aviso "desatualizado há X min". Coletor com backoff exponencial |
| RNF-05 | Integridade: verificar a assinatura JWS antes de persistir e registrar o resultado da verificação |
| RNF-06 | Testável sem eleição: modo **replay** a partir de snapshots gravados (simulado 2026 e histórico 2022) |
| RNF-07 | Responsivo (desktop e celular) e acessível (contraste, leitura por tela nos placares) |
| RNF-08 | Fuso: tudo armazenado em UTC e exibido em **horário de Brasília** (referência oficial) |
| RNF-09 | Neutralidade: cores de candidatos/partidos consistentes e não tendenciosas, sem projeções apresentadas como resultado |

## 4.4 Fora de escopo (v1)

- Recalcular a distribuição de vagas proporcionais. Usamos o que o TSE
  publica.
- Pesquisas eleitorais e projeções estatísticas avançadas.
- Contas com login social. Na v1 os painéis podem ficar salvos localmente e
  ser compartilhados por link. Contas entram na v2.

## 4.5 Critérios de aceite (amostra)

- Dado um snapshot gravado do simulado, ao mover o slider para T, todos os
  widgets exibem os valores do snapshot com `idg` mais recente ≤ T.
- Com o coletor rodando contra o simulado, o tráfego medido nunca passa do
  teto configurado e nenhuma URL 404 é requisitada mais de uma vez.
- Ao abrir um local de votação, o painel lista todas as suas seções (da base
  de locais) e marca quais já têm BU coletado.
- Ao alterar o JWS de um arquivo (1 byte), o coletor rejeita o snapshot e
  registra alerta.
