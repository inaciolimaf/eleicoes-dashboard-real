# Eleições Dashboard — comandos principais. `make` sem alvo lista os comandos.
.PHONY: help env up up-oficial dev down reset logs ps test test-unit lint format types docs boundaries \
        migrate revision web-test web-format web-types web-build web-coverage e2e mobile \
        fake-status fake-velocidade fake-reiniciar fake-ir

COMPOSE = docker compose
API ?= http://localhost:8000
WEB ?= http://localhost:8080

help: ## Lista os comandos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# --- Docker -----------------------------------------------------------------
env: ## copia .env.example para .env (na primeira vez)
	@test -f .env || cp .env.example .env

up: env ## sobe o sistema completo (mock do TSE) em http://localhost:8080
	$(COMPOSE) up -d --build
	@echo "Dashboard: $(WEB)  |  API: $(API)/api/docs  |  Mock TSE: http://localhost:8089/_fake/estado"

up-oficial: env ## sobe contra o TSE real (sem o mock)
	TSE_AMBIENTE=oficial TSE_BASE_URL=https://resultados.tse.jus.br/oficial TSE_MAX_RPS=90 \
		$(COMPOSE) up -d --build db redis migrate api collector worker web

dev: env ## modo desenvolvimento (reload + Vite em http://localhost:5173)
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up --build

down:
	$(COMPOSE) down

reset: ## apaga banco, filas e arquivos coletados
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f $(s)

ps:
	$(COMPOSE) ps

# --- Banco ------------------------------------------------------------------
migrate: ## aplica as migrações
	$(COMPOSE) run --rm migrate

revision: ## make revision m="descrição"
	$(COMPOSE) run --rm --no-deps -v ./backend:/app migrate alembic revision --autogenerate -m "$(m)"

# --- Qualidade --------------------------------------------------------------
test: ## testes do backend em containers (pytest + cobertura >= 85%)
	$(COMPOSE) -f docker-compose.test.yml run --rm --build api-test; \
		status=$$?; $(COMPOSE) -f docker-compose.test.yml down -v; exit $$status

lint: ## ruff + format check + function/file size + import boundaries (same as CI)
	cd backend && uv run ruff check . && uv run ruff format --check . && \
		uv run python -m tools.function_size && uv run lint-imports

test-unit: ## backend unit tests only (no database)
	cd backend && uv run pytest -q -m "not integration"

format: ## corrige o formato do Python (ruff format)
	cd backend && uv run ruff format .

types: ## mypy estrito
	cd backend && uv run mypy

docs: ## a documentação cobre o código e não cita o que sumiu
	cd backend && uv run python -m tools.docs_coverage

boundaries: ## só as fronteiras de importação (lint-imports)
	cd backend && uv run lint-imports

# --- Frontend ---------------------------------------------------------------
web-test: ## eslint + prettier + tsc + vitest (a mesma ordem do CI)
	cd frontend && npm run lint && npm run format:check && npx tsc -b && npm test

web-format: ## corrige o formato do frontend (prettier)
	cd frontend && npm run format

web-types: ## regenera os tipos da API a partir do OpenAPI
	cd backend && uv run python -m tools.openapi
	cd frontend && npm run types

web-build: ## build de produção do frontend
	cd frontend && npm run build

web-coverage: ## vitest com cobertura (falha abaixo de 60%)
	cd frontend && npm run coverage

e2e: ## Playwright: smoke de todas as rotas
	cd frontend && npm run e2e

mobile: ## Playwright: todas as rotas em 390x844
	cd frontend && npm run mobile

# --- Mock do TSE ------------------------------------------------------------
fake-status:
	@curl -s http://localhost:8089/_fake/estado; echo

fake-velocidade: ## make fake-velocidade v=20
	@curl -s -X POST http://localhost:8089/_fake/controle -H 'content-type: application/json' -d '{"velocidade": $(v)}'; echo

fake-reiniciar:
	@curl -s -X POST http://localhost:8089/_fake/controle -H 'content-type: application/json' -d '{"reiniciar": true}'; echo

fake-ir: ## make fake-ir h=19:30
	@curl -s -X POST http://localhost:8089/_fake/controle -H 'content-type: application/json' -d '{"ir_para": "$(h)"}'; echo
