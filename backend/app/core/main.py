import re
import uuid
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse
from starlette.routing import BaseRoute, Match
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.health import router as health_router
from app.core.log import configure_logging
from app.core.redis import get_redis
from app.infra.realtime.hub import Hub
from app.modules.accounts import router as accounts_router
from app.modules.admin import router as admin_router
from app.modules.alerts import router as alerts_router
from app.modules.public import router as public_router
from app.modules.public import ws_router

API_PREFIX = "/api/v1"
REQUEST_ID_HEADER = b"x-request-id"
#: A caller's id is kept only when it is short and plain: it goes into the logs, so no spaces or newlines.
_SANE_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,128}")
log = structlog.get_logger("api")


class RequestIdMiddleware:
    """Gives each request an id, echoes it in the response and binds it to the log context.

    The caller's `x-request-id` is propagated when it is sane, otherwise a new id is generated.
    `route` is the route template (`/api/v1/...{id}`), so the logs group by endpoint, not by URL.
    """

    def __init__(self, app: ASGIApp, routes: Sequence[BaseRoute]) -> None:
        self.app = app
        self.routes = routes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        request_id = _incoming_request_id(scope) or uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            route=self._route_template(scope),
            method=scope.get("method", scope["type"]),
        )

        async def send_with_request_id(message: Message) -> None:
            if message["type"] in ("http.response.start", "websocket.accept"):
                headers = [*message.get("headers", []), (REQUEST_ID_HEADER, request_id.encode())]
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            structlog.contextvars.unbind_contextvars("request_id", "route", "method")

    def _route_template(self, scope: Scope) -> str:
        for route in self.routes:
            match, _ = route.matches(scope)
            if match == Match.FULL:
                return str(getattr(route, "path", "unmatched"))
        return "unmatched"


def _incoming_request_id(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == REQUEST_ID_HEADER:
            candidate: str = value.decode("latin-1")
            if _SANE_REQUEST_ID.fullmatch(candidate):
                return candidate
    return None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    log.info("api.starting", environment=get_settings().environment)
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
    # Added last so it is the outermost middleware: every response carries the id.
    app.add_middleware(RequestIdMiddleware, routes=app.router.routes)
    return app


app = create_app()
