# Eleições Dashboard Real

Dashboard para acompanhar em tempo real a apuração das eleições brasileiras com
dados oficiais do TSE. Dá para filtrar por cargo (Presidente, Governador,
Senador, Deputados), por recorte geográfico (Brasil → UF → município → zona →
local de votação/"colégio" → seção) e por momento da apuração (replay /
"máquina do tempo"). Os painéis são montados pelo próprio usuário.

> **Status:** fase de especificação do **sistema completo**. Ainda não existe
> código, só os documentos abaixo.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic,
  PostgreSQL 16 + TimescaleDB + PostGIS, Redis, MinIO. Testes com pytest
  (testes automatizados **só no backend**).
- **Frontend:** React 18, TypeScript, Vite, Mantine (componentes prontos),
  Apache ECharts (gráficos), MapLibre GL + deck.gl (mapas),
  react-grid-layout (dashboard personalizável), TanStack Query, Zustand.
- **Execução:** tudo via **Docker Compose** (`make up`).

## Documentos

| # | Documento | Conteúdo |
|---|-----------|----------|
| 1 | [Como funciona a eleição no Brasil](docs/01-sistema-eleitoral.md) | Cargos, turnos, regras majoritária e proporcional, hierarquia geográfica, fluxo da urna até a totalização, calendário de 2026 |
| 2 | [Fontes de dados do TSE](docs/02-fontes-de-dados-tse.md) | Existe API? Arquivos JSON/JWS de divulgação, catálogo, padrões de URL, dicionário de campos, limites, assinatura, Dados Abertos |
| 3 | [Dados por zona, local de votação e seção](docs/03-granularidade-secao.md) | Como chegar ao nível de seção em tempo real (boletins de urna) e como montar a visão por "colégio" |
| 4 | [Requisitos do produto](docs/04-requisitos.md) | Votos válidos e situação de eleito, granularidade, mapas, tempo real, linha do tempo, personalização, critérios de aceite |
| 5 | [Arquitetura](docs/05-arquitetura.md) | Stack, coletor, worker, API REST e WebSocket, geodados |
| 6 | [Modelo de dados](docs/06-modelo-de-dados.md) | Entidades, tabelas, snapshots e agregações |
| 7 | [Plano de entrega e riscos](docs/07-roadmap-riscos.md) | Ordem de construção do sistema completo, validações pendentes, riscos |
| 8 | [Backend](docs/08-backend.md) | FastAPI, modelos SQLAlchemy, migrações Alembic, regras de domínio, **testes** |
| 9 | [Frontend](docs/09-frontend.md) | Bibliotecas, visual, telas, placar com votos válidos e eleito, **mapas**, personalização, tempo real |
| 10 | [Docker](docs/10-docker.md) | Serviços do Compose, Dockerfiles, Makefile, testes e produção |

## Resumo da pesquisa

- O TSE **não tem uma API REST** com consultas e filtros. O que existe é a
  publicação de **arquivos estáticos JSON** (e, desde 2026, também **JWS**,
  que é JSON assinado com Ed25519) em `resultados.tse.jus.br`, atualizados à
  medida que os boletins de urna chegam. Todo sistema "em tempo real",
  inclusive o app oficial Resultados e os portais de notícia, consome esses
  arquivos.
- O ponto de entrada é o **catálogo** `comum/config/ele-c.json`. Ele lista
  pleitos, eleições, cargos e os **templates de diretório** de cada tipo de
  arquivo.
- Os resultados oficiais em tempo real vão até **município** e **zona**. O
  nível de **seção** sai dos **boletins de urna (BU)**, publicados por seção
  durante a totalização (arquivo binário ASN.1). O **local de votação**
  ("colégio") vem dentro do próprio BU e o nome/endereço de cada local está no
  Portal de Dados Abertos.
- O TSE **não guarda histórico das parciais**. Para o filtro "por tempo",
  nosso sistema precisa gravar um snapshot a cada nova geração dos arquivos.
- 1º turno: **04/10/2026**. Divulgação a partir das **17h (horário de
  Brasília)** em todo o país. 2º turno: **25/10/2026**.
