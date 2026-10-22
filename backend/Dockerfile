# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/usr/local
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app

# Camada de dependências: só é invalidada quando o lock muda.
FROM base AS deps
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM base AS deps-dev
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

FROM deps AS runtime
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY app ./app
COPY tse_fake ./tse_fake
COPY tools ./tools
COPY alembic ./alembic
COPY alembic.ini ./
COPY entrypoint-api.sh /usr/local/bin/entrypoint-api
RUN chmod +x /usr/local/bin/entrypoint-api \
    && mkdir -p /data/brutos /data/fotos \
    && useradd -m app && chown -R app /data /app
USER app
EXPOSE 8000
ENTRYPOINT ["entrypoint-api"]
CMD ["uvicorn", "app.core.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]

# Imagem de teste: mesmas dependências + as de desenvolvimento (ruff, pytest, mypy).
FROM deps-dev AS test
COPY --from=deps-dev /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps-dev /usr/local/bin /usr/local/bin
COPY app ./app
COPY tse_fake ./tse_fake
COPY tools ./tools
COPY tests ./tests
COPY alembic ./alembic
COPY alembic.ini ./
CMD ["pytest", "-q"]
