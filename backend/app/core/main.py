import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.health import router as health_router
from app.core.redis import get_redis
from app.infra.realtime.hub import Hub
from app.modules.accounts import router as accounts_router
from app.modules.admin import router as admin_router
from app.modules.alerts import router as alerts_router
from app.modules.public import router as public_router
from app.modules.public import ws_router

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logging.basicConfig(
        level=get_settings().log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    hub = Hub(get_redis())
    app.state.hub = hub
    hub.start()
    yield
    await hub.stop()


def create_app() -> FastAPI:
    settings = get_settings()
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
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    for router in (public_router, accounts_router, alerts_router, admin_router, ws_router):
        app.include_router(router, prefix=API_PREFIX)
    app.include_router(health_router)
    return app


app = create_app()
