# 10. Docker

Todo o sistema sobe com Docker Compose. Nada precisa ser instalado na máquina
além do Docker.

## 10.1 Serviços

| Serviço | Imagem / build | Função | Porta (host) |
|---|---|---|---|
| `db` | `timescale/timescaledb-ha:pg16` (já inclui PostGIS) | PostgreSQL + TimescaleDB + PostGIS | 5432 |
| `redis` | `redis:7-alpine` | Cache, pub/sub, filas (arq), rate limiter | 6379 |
| `minio` | `minio/minio` | Arquivos brutos do TSE e BUs | 9000 / 9001 (console) |
| `minio-init` | `minio/mc` | Cria o bucket `tse-brutos` (roda uma vez) | — |
| `migrate` | `./backend` | `alembic upgrade head` (roda uma vez) | — |
| `seed` | `./backend` | `python -m app.cli seed` (malhas IBGE, locais de votação, partidos). Idempotente | — |
| `api` | `./backend` | `uvicorn app.main:app` (REST + WebSocket) | 8000 |
| `collector` | `./backend` | `python -m app.collector.main` | — |
| `worker` | `./backend` | `arq app.worker.main.WorkerSettings` (escalável: `--scale worker=3`) | — |
| `tse-fake` | `./backend` | `uvicorn tse_fake.main:app`: serve snapshots gravados com URLs iguais às do TSE | 8080 |
| `web` | `./frontend` | Em dev: `vite` com HMR. Em prod: nginx servindo o build e fazendo proxy de `/api` e `/ws` | 5173 (dev) / 80 (prod) |

Ordem de subida com `depends_on` + `healthcheck`: `db`, `redis` e `minio`
saudáveis → `migrate` e `minio-init` concluídos (`service_completed_successfully`)
→ `seed` → `api`, `collector` e `worker` → `web`.

## 10.2 Arquivos

```
docker-compose.yml          # base (todos os serviços)
docker-compose.override.yml # dev: volumes com código, reload, vite dev server, TSE_AMBIENTE=fake
docker-compose.prod.yml     # prod: web com nginx, sem volumes de código, restart: unless-stopped
docker-compose.test.yml     # testes do backend: db-test (tmpfs), redis-test, api-test (pytest)
.env.example                # todas as variáveis do doc 08 com valores padrão
Makefile
backend/Dockerfile          # multi-stage: builder (uv/pip wheels) → runtime python:3.12-slim
frontend/Dockerfile         # multi-stage: node:20 (build) → nginx:alpine
frontend/nginx.conf         # SPA fallback, gzip/brotli, cache longo de assets, proxy /api e /ws (upgrade)
```

O `backend/Dockerfile` gera uma única imagem, usada por `api`, `collector`,
`worker`, `migrate`, `seed` e `tse-fake`. Muda só o `command`.

## 10.3 Comandos (Makefile)

| Comando | O que faz |
|---|---|
| `make up` | `docker compose up -d --build` (dev, contra o tse-fake) |
| `make up-oficial` | Sobe com `TSE_AMBIENTE=oficial` (dia da eleição) |
| `make up-simulado` | Sobe contra o simulado do TSE |
| `make prod` | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` |
| `make logs s=collector` | Logs de um serviço |
| `make migrate` / `make revision m="msg"` | Alembic upgrade / nova revisão autogerada |
| `make seed` | Carrega geodados, locais de votação e partidos |
| `make replay arquivo=... velocidade=60` | O tse-fake reproduz uma noite gravada |
| `make test` | Sobe `docker-compose.test.yml` e roda `pytest --cov` (só backend) |
| `make lint` | ruff + mypy (backend), eslint + tsc (frontend) |
| `make types` | Gera os tipos TS a partir do OpenAPI da api |
| `make down` / `make reset` | Para tudo / para e apaga volumes |

## 10.4 Volumes e dados

- `pgdata` (banco), `redisdata` (AOF ligado, para não perder filas),
  `miniodata` (brutos), `seedcache` (downloads de IBGE e Dados Abertos).
- **Backup dos brutos**: o MinIO guarda todo arquivo coletado. Com ele, é
  possível reconstruir o banco inteiro (`python -m app.cli reprocessar`).

## 10.5 Testes em container

`docker-compose.test.yml`:
- `db-test`: mesma imagem do `db`, com dados em `tmpfs` (rápido e
  descartável).
- `redis-test`: Redis efêmero.
- `api-test`: imagem do backend com dependências de dev. Roda
  `alembic upgrade head` e depois `pytest -q --cov=app --cov-fail-under=85`.
- A CI (GitHub Actions) executa `make test` em cada push.

## 10.6 Produção (noite da eleição)

- 1 `collector` (líder) + 1 standby com outro IP, se a política do TSE
  permitir. O lock fica no Redis.
- `api` com `--workers` ajustado e réplicas atrás do nginx. O WebSocket
  escala horizontalmente porque o fan-out é feito via Redis pub/sub.
- `worker` com 2–4 réplicas.
- Healthchecks e `restart: unless-stopped` em todos os serviços.
- `/metrics` exposto para Prometheus/Grafana (opcional, profile
  `observabilidade` no compose).
