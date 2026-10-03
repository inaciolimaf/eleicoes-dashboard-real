.PHONY: env up up-oficial dev down reset logs ps test lint migrate revision fake-status fake-velocidade fake-reiniciar fake-ir

COMPOSE = docker compose
API ?= http://localhost:8000

env:
	@test -f .env || cp .env.example .env

up: env ## sobe o sistema completo (mock do TSE) em http://localhost:8080
	$(COMPOSE) up -d --build
	@echo "Dashboard: http://localhost:8080  |  API: $(API)/api/docs  |  Mock TSE: http://localhost:8089/_fake/estado"

up-oficial: env ## sobe contra o TSE real (sem o mock)
	TSE_AMBIENTE=oficial TSE_BASE_URL=https://resultados.tse.jus.br/oficial TSE_MAX_RPS=60 \
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

test: ## testes do backend (únicos testes automatizados do projeto)
	$(COMPOSE) -f docker-compose.test.yml run --rm --build api-test; \
		status=$$?; $(COMPOSE) -f docker-compose.test.yml down -v; exit $$status

lint:
	$(COMPOSE) run --rm --no-deps api ruff check app tse_fake tests
	cd frontend && npm run lint && npm run typecheck

migrate:
	$(COMPOSE) run --rm migrate

revision: ## make revision m="descrição"
	$(COMPOSE) run --rm --no-deps -v ./backend:/app migrate alembic revision --autogenerate -m "$(m)"

fake-status:
	@curl -s http://localhost:8089/_fake/estado; echo

fake-velocidade: ## make fake-velocidade v=20
	@curl -s -X POST http://localhost:8089/_fake/controle -H 'content-type: application/json' -d '{"velocidade": $(v)}'; echo

fake-reiniciar:
	@curl -s -X POST http://localhost:8089/_fake/controle -H 'content-type: application/json' -d '{"reiniciar": true}'; echo

fake-ir: ## make fake-ir h=19:30
	@curl -s -X POST http://localhost:8089/_fake/controle -H 'content-type: application/json' -d '{"ir_para": "$(h)"}'; echo
