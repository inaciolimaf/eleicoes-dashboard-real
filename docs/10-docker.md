# 10. Docker

Todo o sistema sobe com Docker Compose. Não é preciso instalar nada além do Docker.

```bash
make up          # = cp .env.example .env (1ª vez) + docker compose up -d --build
# Dashboard:  http://localhost:8080
# API (docs): http://localhost:8000/api/docs
# Mock TSE:   http://localhost:8089/_fake/estado
```

## 10.1 Serviços (`docker-compose.yml`)

| Serviço | Imagem / build | Função | Porta (host) |
|---|---|---|---|
| `db` | `postgres:16-alpine` | Banco (snapshots, estado atual, boletins, usuários e painéis) | 5432 |
| `redis` | `redis:7-alpine` (AOF ligado) | Fila coletor → worker, pub/sub do tempo real, tópicos ativos, métricas | — |
| `tse-fake` | `./backend` | **Mock do TSE**: mesmas URLs, JSON/JWS assinados, boletins de urna ASN.1, CSV de locais, relógio simulado | 8089 |
| `migrate` | `./backend` | `alembic upgrade head` (roda uma vez) | — |
| `api` | `./backend` | FastAPI (REST + WebSocket), 2 workers uvicorn | 8000 |
| `collector` | `./backend` | Coletor (catálogo → resultados → acompanhamento → municípios → seções) | — |
| `worker` | `./backend` (2 réplicas) | Ingestão, eventos, alertas e publicação em tempo real | — |
| `web` | `./frontend` | Build do Vite servido por nginx, com proxy de `/api` e do WebSocket | 8080 |

Ordem de subida: `db` e `redis` saudáveis → `migrate` concluído → `api`, `collector` e `worker` → `web`.
A mesma imagem do backend serve `api`, `collector`, `worker`, `migrate` e `tse-fake`. Só muda o `command`.

## 10.2 Arquivos

```
docker-compose.yml        # sistema completo (mock do TSE por padrão)
docker-compose.dev.yml    # dev: código montado com reload e Vite com HMR em :5173
docker-compose.test.yml   # testes do backend (db-test em tmpfs, redis-test, api-test)
.env.example              # todas as variáveis (copiado para .env no primeiro `make up`)
Makefile
backend/Dockerfile        # python:3.12-slim, dependências em estágio separado
frontend/Dockerfile       # node:20 (build) → nginx:alpine
frontend/Dockerfile.dev   # Vite dev server
frontend/nginx.conf       # SPA fallback, gzip, cache de assets, proxy /api e WebSocket
```

## 10.3 Comandos (Makefile)

| Comando | O que faz |
|---|---|
| `make up` | Sobe tudo contra o mock do TSE |
| `make up-oficial` | Sobe contra o TSE real (`TSE_AMBIENTE=oficial`, 90 req/s), sem o mock |
| `make dev` | Modo desenvolvimento (reload no backend, Vite em http://localhost:5173) |
| `make test` | **Testes do backend** (ruff + pytest com cobertura mínima de 85%) em containers |
| `make logs s=collector` | Logs de um serviço |
| `make fake-status` | Estado do relógio simulado (horário, % de seções, velocidade) |
| `make fake-velocidade v=20` | Acelera/desacelera a apuração simulada |
| `make fake-ir h=19:30` | Pula o relógio simulado para um horário |
| `make fake-reiniciar` | Volta para 16:58 |
| `make migrate` / `make revision m="msg"` | Alembic upgrade / nova revisão autogerada |
| `make down` / `make reset` | Para tudo / para e apaga volumes (banco, filas, brutos) |

O relógio do mock também pode ser controlado pela página **Admin** do dashboard. O primeiro usuário
registrado vira admin.

## 10.4 O mock do TSE (`tse-fake`)

- Usa os **5.563 municípios reais** (nomes, códigos IBGE, posição) e gera cerca de 57 mil seções, 12,7 mil locais
  de votação, candidatos e partidos **fictícios** e votos com tendências regionais. Por exemplo, um candidato
  a presidente forte no Nordeste e outro no Sul/Sudeste, com regiões apurando em ritmos diferentes, o que
  produz **viradas** durante a noite.
- Serve exatamente os caminhos do TSE: `comum/config/ele-c.json|jws`, `mun-…-cm`, `…-ab` (acompanhamento),
  `…-u` (resultado unificado por Brasil/UF/município/zona), `…-e` (eleitos), fotos, `…-cs` (seções),
  `…-aux` (auxiliar de seção) e os **boletins de urna `.bu` em ASN.1** conforme a especificação do TSE.
- Os `.jws` são assinados com Ed25519, com uma chave de desenvolvimento determinística. O coletor verifica a
  assinatura como faria com o TSE real.
- Respeita ETag/`If-None-Match` (304) e gera arquivos em **rodadas de totalização** de 30 s simulados.
- Ao final, calcula eleitos (maioria absoluta ou 2º turno, Senado com 2 vagas, proporcional por D'Hondt)
  e marca "matematicamente eleito" quando a vantagem não pode mais ser revertida.
- Variáveis: `FAKE_VELOCIDADE` (padrão 5×), `FAKE_INICIO_MIN` (-2 = 16:58), `FAKE_SEMENTE`, `FAKE_ESCALA`.

## 10.5 Volumes

`pgdata` (banco), `redisdata` (fila e pub/sub), `brutos` (todos os arquivos originais coletados, um por
geração `idg`, para auditoria e reprocessamento) e `fotos` (cache das fotos de candidatos).

## 10.6 Testes em container

`docker-compose.test.yml` sobe `db-test` (Postgres em tmpfs) e `redis-test`, e roda no `api-test`:
`ruff check` + `pytest --cov=app --cov-fail-under=85`. O frontend não tem testes automatizados (decisão do
projeto).

## 10.7 Dia da eleição (TSE real)

1. Em `.env`: `TSE_AMBIENTE=oficial`, `TSE_BASE_URL=https://resultados.tse.jus.br/oficial`, `TSE_MAX_RPS=90`
   (nunca acima de 100) e `LOCAIS_VOTACAO_URL` com o CSV/ZIP de locais de votação de 2026 dos Dados Abertos.
2. `make up-oficial`.
3. Acompanhe a página Admin (req/s, 304/404, falhas de JWS, filas). Se algo der errado no formato, os brutos
   ficam no volume `brutos` para reprocessar.

## 10.x Deploy no Coolify

`docker-compose.coolify.yml` já vem pronto: **não precisa configurar nenhuma variável** no Coolify.

1. New Resource → seu repositório Git → Build Pack **Docker Compose**.
2. Docker Compose Location: `/docker-compose.coolify.yml` → Deploy.

- Roda contra o **TSE oficial** (90 req/s), sem o mock.
- Senha do Postgres e `JWT_SECRET` são gerados pelo Coolify (`SERVICE_PASSWORD_*`) e mantidos entre deploys.
- O domínio é gerado automaticamente para o serviço `web` (porta 80); para usar o seu, edite em *Domains* do `web`.
- Nada publica porta no host: o acesso é só pelo proxy do Coolify. A API fica em `/api` no mesmo domínio.
- As migrações rodam no início da `api`; `collector` e os dois workers sobem depois que ela fica saudável.
- O primeiro usuário registrado vira admin: registre-se logo após o primeiro deploy.
