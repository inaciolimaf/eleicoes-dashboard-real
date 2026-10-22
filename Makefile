# Election dashboard — main commands. `make` with no target lists them.
.PHONY: help env up up-oficial dev down reset logs ps test test-unit lint format types docs boundaries \
        migrate revision web-test web-format web-types web-build web-coverage e2e mobile e2e-flows \
        fake-status fake-velocidade fake-reiniciar fake-ir

COMPOSE = docker compose
API ?= http://localhost:8000
WEB ?= http://localhost:8080

help: ## list the available commands
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- Docker -----------------------------------------------------------------
env: ## copy .env.example to .env (first time only)
	@test -f .env || cp .env.example .env

up: env ## start the whole system against the fake TSE at http://localhost:8080
	$(COMPOSE) up -d --build
	@echo "Dashboard: $(WEB)  |  API: $(API)/api/docs  |  Mock TSE: http://localhost:8089/_fake/estado"

up-oficial: env ## start against the real TSE (no fake)
	TSE_AMBIENTE=oficial TSE_BASE_URL=https://resultados.tse.jus.br/oficial TSE_MAX_RPS=90 \
		$(COMPOSE) up -d --build db redis migrate api collector worker web

dev: env ## development mode (reload + Vite at http://localhost:5173)
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up --build

down: ## stop the containers
	$(COMPOSE) down

reset: ## delete the database, queues and collected files (volumes)
	$(COMPOSE) down -v

logs: ## follow the logs (make logs s=collector)
	$(COMPOSE) logs -f $(s)

ps: ## list the containers
	$(COMPOSE) ps

# --- Database ---------------------------------------------------------------
migrate: ## apply the migrations
	$(COMPOSE) run --rm migrate

revision: ## new migration: make revision m="description"
	$(COMPOSE) run --rm --no-deps -v ./backend:/app migrate alembic revision --autogenerate -m "$(m)"

# --- Quality ----------------------------------------------------------------
test: ## backend tests in containers (Postgres + Redis, coverage >= 85%)
	$(COMPOSE) -f docker-compose.test.yml run --rm --build api-test; \
		status=$$?; $(COMPOSE) -f docker-compose.test.yml down -v; exit $$status

lint: ## ruff + format check + function/file size + import boundaries + compose files parse (same as CI)
	cd backend && uv run ruff check . && uv run ruff format --check . && \
		uv run python -m tools.function_size && uv run lint-imports
	@for f in docker-compose.yml docker-compose.test.yml docker-compose.coolify.yml; do \
		docker compose -f $$f config -q 2>/dev/null || { echo "invalid compose: $$f"; exit 1; }; done

test-unit: ## backend unit tests only (no database)
	cd backend && uv run pytest -q -m "not integration"

format: ## fix the Python formatting (ruff format)
	cd backend && uv run ruff format .

types: ## strict mypy
	cd backend && uv run mypy

docs: ## docs/system covers the code and cites no vanished path
	cd backend && uv run python -m tools.docs_coverage

boundaries: ## import boundaries only (lint-imports)
	cd backend && uv run lint-imports

# --- Frontend ---------------------------------------------------------------
web-test: ## eslint + prettier check + tsc + vitest (same order as CI)
	cd frontend && npm run lint && npm run format:check && npx tsc --noEmit && npm test

web-format: ## fix the frontend formatting (prettier)
	cd frontend && npm run format

web-types: ## regenerate the frontend API types from the OpenAPI
	cd backend && uv run python -m tools.openapi
	cd frontend && npm run types

web-build: ## production build of the frontend
	cd frontend && npm run build

web-coverage: ## vitest with coverage (fails below 60%)
	cd frontend && npm run coverage

e2e: web-build ## Playwright: every route opens without errors (needs the API on API_URL)
	cd frontend && npm run e2e

mobile: web-build ## Playwright: every route at 390x844 without horizontal overflow
	cd frontend && npm run mobile

e2e-flows: web-build ## Playwright: real flows (login, explore, dashboards); needs E2E_EMAIL/E2E_SENHA
	cd frontend && npm run e2e:flows

# --- Fake TSE ---------------------------------------------------------------
fake-status: ## fake TSE clock and state
	@curl -s http://localhost:8089/_fake/estado; echo

fake-velocidade: ## fake clock speed: make fake-velocidade v=20
	@curl -s -X POST http://localhost:8089/_fake/controle -H 'content-type: application/json' -d '{"velocidade": $(v)}'; echo

fake-reiniciar: ## restart the fake election night
	@curl -s -X POST http://localhost:8089/_fake/controle -H 'content-type: application/json' -d '{"reiniciar": true}'; echo

fake-ir: ## jump the fake clock: make fake-ir h=19:30
	@curl -s -X POST http://localhost:8089/_fake/controle -H 'content-type: application/json' -d '{"ir_para": "$(h)"}'; echo
