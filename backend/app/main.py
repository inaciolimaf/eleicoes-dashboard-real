import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from app.api.v1 import admin, publico, usuario, ws
from app.core.config import get_settings
from app.core.redis import get_redis
from app.realtime.hub import Hub


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=get_settings().log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    hub = Hub(get_redis())
    app.state.hub = hub
    hub.iniciar()
    yield
    await hub.parar()


def criar_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="Eleições Dashboard Real", version="1.0.0", lifespan=lifespan,
                  default_response_class=ORJSONResponse, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    for r in (publico.router, usuario.router, admin.router, ws.router):
        app.include_router(r, prefix="/api/v1")

    @app.get("/api/saude")
    async def saude() -> dict:
        return {"ok": True}

    return app


app = criar_app()
