# 5. Arquitetura

## 5.1 Visão geral

```
                ┌──────────────────────── TSE (CDN Akamai) ────────────────────────┐
                │ ele-c (EA11) · -cm · -ab · -u · -e · fotos · -cs · -aux · .bu     │
                └───────────────▲──────────────────────────────────────────────────┘
                                │ HTTPS + If-None-Match, ≤ 60 req/s por IP
                       ┌────────┴────────┐
                       │   COLETOR       │  agendador com filas de prioridade
                       │ (rate limiter,  │  + verificação JWS + decodificação BU
                       │  ETag, backoff) │
                       └────────┬────────┘
                    raw snapshot│ (bytes + metadados)
                 ┌──────────────┼───────────────────────┐
                 ▼              ▼                       ▼
         Armazenamento    NORMALIZADOR ──► Banco (Postgres + TimescaleDB)
         de objetos       (parse, tipos,     ├ dimensões (eleição, cargo, geo, candidato)
         (S3/R2: JSON/JWS  diff vs anterior) ├ snapshots (séries temporais)
          brutos e BUs)         │            └ estado atual (views materializadas)
                                ▼
                         Barramento de eventos (Redis Streams / NATS)
                         "resultado.atualizado", "virada", "progresso"
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
            API HTTP (REST)              Gateway tempo real
            consultas, histórico,        (WebSocket ou SSE),
            tempo T, exportação          assinatura por tópico
                 │                             │
                 └────────────┬────────────────┘
                              ▼  CDN para respostas "estado atual" (cache de 2–5 s)
                        FRONTEND (SPA)
                        dashboard em grade, widgets, mapa, slider de tempo
```

## 5.2 Coletor

Responsabilidades:
1. **Descoberta**: baixar o EA11 de minuto em minuto e detectar ciclo, pleito
   e eleições. Gerar as "tarefas-semente".
2. **Configuração**: EA12 (municípios) e EA16 (seções por UF), uma vez e
   depois raramente.
3. **Agendamento** com filas de prioridade e intervalos adaptativos:

| Fila | Conteúdo | Intervalo alvo |
|---|---|---|
| P0 | Presidente BR, acompanhamento BR | 5 s |
| P1 | Presidente/Governador/Senador por UF, acompanhamento por UF | 10–15 s |
| P2 | Recortes "vigiados" pelos usuários ativos (município/zona) | 20–30 s |
| P3 | Deputados por UF (arquivos grandes) | 30–60 s |
| P4 | Varredura de municípios/zonas | contínua, com o orçamento restante |
| P5 | Seções (aux → BU) | contínua, ver doc 03 |

   - **Intervalo adaptativo**: se o EA15 de uma UF não mudou, os arquivos dos
     municípios dessa UF são despriorizados. Se um município aparece com
     seções novas, ele sobe na fila.
   - Antes das 17h o polling fica em modo lento (1/min), só para validar que
     a URL existe.
4. **Rate limiter** global (token bucket) com teto configurável. Os `304`
   também consomem token.
5. **Proteção contra 404**: um URL que respondeu 404 só volta a ser tentado
   após novo catálogo ou após X minutos. Há um circuit breaker se a taxa de
   404 ou 403 subir.
6. **Verificação JWS** (Ed25519, `kid` esperado do ambiente). Se falhar, o
   snapshot é descartado e um alerta é disparado.
7. **Persistência bruta**: grava o corpo original no armazenamento de objetos,
   com chave `ambiente/ciclo/eleicao/arquivo/idg`. Isso permite reprocessar e
   fazer replay.
8. Publica a mensagem `arquivo.novo {url, idg, dg/hg, hash}` para o
   normalizador.

Implementação sugerida: **Go** ou **Node.js (TypeScript)**. TypeScript permite
compartilhar parser e tipos com o frontend. A decodificação de BU (ASN.1) pode
ser um worker separado em **Python** (`asn1tools`, que é a ferramenta usada
nos exemplos oficiais do TSE) ou em TS com uma lib BER.

## 5.3 Normalizador

- Converte strings para números, troca vírgula decimal por ponto e
  `dd/mm/aaaa hh:mm:ss` (Brasília) para UTC.
- Faz upsert das **dimensões**: candidatos (`sqcand`), partidos, federações,
  municípios, zonas, locais e seções.
- Grava o **snapshot** do recorte com totais e votos por candidato.
- Calcula **derivados**: diferença em p.p., líder, mudanças de liderança,
  velocidade (votos por minuto) e deltas em relação ao snapshot anterior.
- Emite eventos de domínio: `resultado.atualizado`, `lider.mudou`,
  `progresso.marco` (10%, 25%, 50%, 75%, 90%, 100%), `situacao.mudou`
  (eleito / 2º turno).
- Para BUs: decodifica, faz o join número → candidato e grava o resultado da
  seção. Recalcula o agregado do **local de votação**.

## 5.4 Armazenamento

- **PostgreSQL + TimescaleDB** (hypertables para snapshots e compressão por
  tempo). Alternativa: ClickHouse, se o volume de seções pesar.
- **Redis**: estado atual "quente" por recorte (o que o WebSocket envia),
  rate limiter e pub/sub.
- **Armazenamento de objetos** (S3 / Cloudflare R2 / MinIO local): arquivos
  brutos JSON/JWS e BUs.

Estimativa de volume (1º turno, uma noite):
- Snapshots BR/UF de todos os cargos: cerca de 140 arquivos × ~200 gerações
  = ~30 mil linhas de snapshot (mais candidatos × snapshot nos
  proporcionais, que chegam a milhões de linhas e cabem tranquilo com
  compressão).
- Municípios: 33 mil arquivos × ~10–20 gerações = ~500 mil snapshots.
- Seções: ~470 mil BUs (uma vez cada).

## 5.5 API

REST (exemplos):

```
GET /v1/eleicoes                                    → catálogo normalizado
GET /v1/resultados?eleicao=&cargo=&nivel=&id=&t=    → estado no instante t (padrão: agora)
GET /v1/resultados/serie?eleicao=&cargo=&nivel=&id=&de=&ate=&passo=
GET /v1/recortes/filhos?nivel=uf&id=sp&cargo=3      → tabela de municípios com líder
GET /v1/progresso?eleicao=&nivel=&id=               → seções/eleitorado totalizados
GET /v1/locais?busca=escola%20estadual&municipio=   → busca de locais de votação
GET /v1/locais/{id}                                 → local, com seções e resultado agregado
GET /v1/secoes/{uf}/{mun}/{zona}/{secao}            → resultado da seção (BU)
GET /v1/eventos?desde=                              → feed de eventos
GET /v1/export?...&formato=csv
```

Tempo real (WebSocket ou SSE):
- O cliente assina tópicos (`res:<eleicao>:<cargo>:<nivel>:<id>`,
  `prog:<nivel>:<id>`, `eventos`).
- O servidor envia **diffs** (somente o que mudou) com `idg` e horário.
- Quando o cliente assina um recorte, isso também é um sinal para o coletor
  (fila P2): "tem gente olhando".

## 5.6 Frontend

- **React + TypeScript + Vite**.
- Grade de widgets: `react-grid-layout`.
- Gráficos: ECharts ou Recharts. Mapas: MapLibre GL (vetorial, com malhas
  IBGE de UF e município) e pins para locais de votação.
- Estado: TanStack Query (REST) e um store leve (Zustand) para filtros
  globais e o tempo T.
- Configuração do painel em JSON (versionado): `{ widgets: [{ tipo, pos,
  filtros, herdaFiltroGlobal }], filtroGlobal: {...} }`. Fica salvo em
  localStorage na v1 e no backend na v2. Link de compartilhamento leva o JSON
  comprimido na URL ou um id.
- **Slider de tempo global**: quando T ≠ "agora", o frontend deixa de
  consumir o WebSocket e consulta `?t=`.

## 5.7 Ambientes e testes

- **Modo replay**: um servidor "TSE fake" serve snapshots gravados (do
  simulado 2026 e do histórico 2022) com a mesma estrutura de URL e com
  ETag/idg avançando no tempo. É a base de testes de integração e de carga,
  e serve para treinar a noite da eleição.
- Testes de contrato do parser com fixtures reais (catálogo, EA20, EA14, BU).
- Teste de carga do gateway em tempo real (10 mil conexões).

## 5.8 Implantação

- Coletor: 1 instância ativa (líder) e 1 standby (lock no Redis). Isso evita
  dobrar o tráfego ao TSE.
- API e gateway: escaláveis horizontalmente atrás de CDN.
- Observabilidade: métricas de req/s ao TSE, taxa de 304/200/404/403,
  atraso entre `hg` e a ingestão, atraso de ponta a ponta até o cliente e
  falhas de JWS. Painel interno e alertas.
