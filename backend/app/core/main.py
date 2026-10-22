import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from app.core.config import get_settings
from app.core.redis import get_redis
from app.infra.realtime.hub import Hub
from app.modules.accounts import router as accounts_router
from app.modules.admin import router as admin_router
from app.modules.alerts import router as alerts_router
from app.modules.public import router as public_router
from app.modules.public import ws_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logging.basicConfig(
        level=get_settings().log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    hub = Hub(get_redis())
    app.state.hub = hub
    hub.iniciar()
    yield
    await hub.parar()


def criar_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="Eleições Dashboard Real",
        version="1.0.0",
        lifespan=lifespan,
        default_response_class=ORJSONResponse,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for r in (public_router, accounts_router, alerts_router, admin_router, ws_router):
        app.include_router(r, prefix="/api/v1")

    @app.get("/api/saude")
    async def saude() -> dict:
        return {"ok": True}

    return app


app = criar_app()
