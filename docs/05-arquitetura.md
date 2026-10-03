# 5. Arquitetura

## 5.1 Stack definida

| Camada | Tecnologia |
|---|---|
| Backend / API | **Python 3.12 + FastAPI** (Pydantic v2), Uvicorn |
| ORM e migrações | **SQLAlchemy 2.0** (modelos declarativos tipados, queries montadas com a API do SQLAlchemy, async com `asyncpg`) + **Alembic** |
| Banco | **PostgreSQL 16 + TimescaleDB** (séries temporais) + **PostGIS** (geometrias de UF/município e pontos dos locais) |
| Cache / pub-sub / filas | **Redis 7** |
| Armazenamento bruto | **MinIO** (compatível com S3) para JSON/JWS/BU originais |
| Coletor e workers | Python (mesma base de código do backend): `httpx` async, `cryptography` (Ed25519), `asn1tools` (BU) e **arq** (fila de jobs sobre Redis) |
| Tempo real | WebSocket do FastAPI + Redis pub/sub |
| Frontend | **React 18 + TypeScript + Vite**, com bibliotecas de componentes prontos (detalhes no [doc 09](09-frontend.md)) |
| Mapas | MapLibre GL + deck.gl, com malhas do IBGE |
| Infra | **Docker + Docker Compose** ([doc 10](10-docker.md)) |
| Testes | **Somente backend**: pytest ([doc 08](08-backend.md)) |

## 5.2 Visão geral

```
                ┌──────────────────────── TSE (CDN Akamai) ────────────────────────┐
                │ ele-c (EA11) · -cm · -ab · -u · -e · fotos · -cs · -aux · .bu     │
                └───────────────▲──────────────────────────────────────────────────┘
                                │ HTTPS + If-None-Match, ≤ 60 req/s por IP
                       ┌────────┴────────┐
                       │  collector      │  agendador com filas de prioridade
                       │  (container)    │  rate limiter, ETag, backoff, JWS
                       └────────┬────────┘
                   job "arquivo.novo"│ (Redis / arq)
                       ┌────────▼────────┐        ┌──────────┐
                       │  worker         │──────► │  MinIO   │ brutos
                       │  normaliza, BU, │        └──────────┘
                       │  eventos        │──────► PostgreSQL (Timescale + PostGIS)
                       └────────┬────────┘
                    publish     │ Redis pub/sub  "res:*", "prog:*", "eventos"
                       ┌────────▼────────┐
                       │  api (FastAPI)  │  REST + WebSocket /ws
                       └────────┬────────┘
                                │
                       ┌────────▼────────┐
                       │  web (React)    │  nginx serve o build e faz proxy de /api e /ws
                       └─────────────────┘
```

Todos os serviços são containers do mesmo `docker-compose.yml`. O
**tse-fake** é um container extra que serve snapshots gravados com a mesma
estrutura de URL do TSE, para desenvolvimento, replay e testes.

## 5.3 Collector (coletor)

1. **Descoberta**: baixa o EA11 a cada minuto e detecta ciclo, pleito e
   eleições. Gera as tarefas-semente.
2. **Configuração**: EA12 (municípios) e EA16 (seções por UF), uma vez e
   depois raramente.
3. **Agendamento** com filas de prioridade e intervalos adaptativos:

| Fila | Conteúdo | Intervalo alvo |
|---|---|---|
| P0 | Presidente BR, acompanhamento BR | 5 s |
| P1 | Presidente/Governador/Senador por UF, acompanhamento por UF | 10 s |
| P2 | Recortes com usuários olhando agora (sinalizado pela API via Redis) | 20 s |
| P3 | Deputados por UF (arquivos grandes) | 30–60 s |
| P4 | Varredura de municípios e zonas | contínua, com o orçamento restante |
| P5 | Seções (aux → BU), priorizando recortes vigiados | contínua |

   - **Intervalo adaptativo**: se o EA15 de uma UF não mudou, os municípios
     dessa UF são despriorizados. Seções novas totalizadas sobem a prioridade.
   - Antes das 17h o polling é lento (1/min).
4. **Rate limiter** global (token bucket no Redis) com teto configurável. Os
   `304` também consomem token.
5. **Proteção contra 404/403**: memória de URLs 404 por ciclo de catálogo e
   circuit breaker.
6. **Verificação JWS** (Ed25519, `kid` esperado do ambiente). Se falhar, o
   snapshot é descartado e é gerado um alerta.
7. Grava o bruto no MinIO (`ambiente/ciclo/eleicao/arquivo/idg`) e enfileira
   o job `processar_arquivo`.
8. Só uma instância lidera (lock no Redis), para não dobrar o tráfego ao TSE.

## 5.4 Worker (normalização)

- Converte strings para números, troca vírgula decimal por ponto e
  `dd/mm/aaaa hh:mm:ss` (Brasília) para UTC.
- Faz upsert das dimensões (candidatos, partidos, agremiações, geografia).
- Grava o snapshot (totais + votos por candidato + situação).
- Calcula derivados: líder, margem em p.p., deltas e "liderando".
- Detecta eventos: virada, marcos de apuração, eleito, 2º turno e recorte
  finalizado.
- BUs: decodifica o ASN.1, faz o join número → candidato, grava o resultado
  da seção e recalcula o local de votação e a cobertura.
- Publica as mudanças no Redis (`res:<eleicao>:<cargo>:<nivel>:<id>`,
  `prog:<nivel>:<id>`, `mapa:<eleicao>:<cargo>:<nivel>:<pai>`, `eventos`).
- Avalia as regras de alerta (RF-09) e envia notificações.

## 5.5 API (FastAPI)

REST, com prefixo `/api/v1` (contratos detalhados no [doc 08](08-backend.md)):

```
GET  /eleicoes                                        catálogo normalizado
GET  /resultados?eleicao=&cargo=&nivel=&id=&t=        estado no instante t (padrão: agora)
GET  /resultados/serie?...&de=&ate=&passo=            evolução temporal
GET  /recortes/{nivel}/{id}/filhos?cargo=&t=&filtros  tabela de filhos (vencedor, margem, % apurado)
GET  /progresso?eleicao=&nivel=&id=&t=                seções/eleitorado totalizados
GET  /mapas/vencedores?eleicao=&cargo=&nivel=&pai=&t= GeoJSON/valores por feição
GET  /mapas/desempenho?...&candidato=                 % de um candidato por feição
GET  /mapas/progresso?...                             % apurado por feição
GET  /mapas/locais?uf=&municipio=&bbox=&t=            pontos dos locais com status e vencedor
GET  /geo/{nivel}/{id}                                geometria simplificada (TopoJSON, cacheável)
GET  /busca?q=                                        busca global (municípios, locais, candidatos...)
GET  /locais/{id}                                     local de votação com seções e agregado
GET  /secoes/{uf}/{mun}/{zona}/{secao}                resultado da seção (BU)
GET  /candidatos/{sqcand}                             perfil + resultados por recorte
GET  /eventos?desde=&tipos=                           feed
GET  /export?...&formato=csv|json|xlsx
POST /auth/registro, /auth/login, /auth/refresh       JWT
CRUD /paineis, /paineis/{id}/compartilhar, /favoritos, /alertas, /preferencias
GET  /admin/saude                                     métricas do coletor (admin)
WS   /ws                                              tempo real
```

WebSocket `/ws`:
- O cliente envia `{"op":"sub","topicos":[...]}` / `{"op":"unsub",...}`.
- O servidor envia `{"topico","seq","idg","totalizado_em","diff"}`, só com o
  que mudou.
- Ao reconectar, o cliente envia `{"op":"resume","seq":N}` e o servidor
  reenvia o que ficou pendente (buffer em Redis Streams) ou um snapshot
  completo.
- Uma assinatura de recorte sinaliza ao coletor (fila P2) que "tem gente
  olhando".

## 5.6 Geodados para os mapas

- **Malhas do IBGE** (UF e municípios), da API de malhas
  `servicodados.ibge.gov.br/api/v3/malhas`, carregadas no PostGIS por um
  comando de seed. Versões simplificadas (com `ST_SimplifyPreserveTopology`)
  em 3 níveis de detalhe e servidas como TopoJSON com cache longo.
- **Correspondência TSE ↔ IBGE** de municípios: vem do EA12.
- **Locais de votação**: lat/long do conjunto "Eleitorado – local de
  votação" (Dados Abertos), em coluna `geometry(Point, 4326)`. Locais sem
  coordenada usam o centróide do município e ficam marcados como
  "posição aproximada".
- **Zonas** não têm malha oficial. No mapa, a zona é representada pelo
  conjunto de pontos dos seus locais (com casco convexo opcional).
- **Exterior (ZZ)**: painel à parte, com lista e mapa-múndi por país.

## 5.7 Observabilidade

- Métricas Prometheus (`/metrics`): req/s ao TSE, taxa de 304/200/404/403,
  atraso `hg` → ingestão → cliente, falhas de JWS, tamanho das filas,
  conexões WebSocket.
- Logs estruturados em JSON.
- A página admin (RF-12) consome essas métricas.
