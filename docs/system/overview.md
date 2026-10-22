# Overview: logging

## Logging

`backend/app/core/log/` (`configure_logging(settings)`, in `configure.py`) configures structlog and the root logger. It is a package, not a module, because `app/core` may hold at most 8 Python files (`test_architecture.py`).
It is called by the API lifespan (`backend/app/core/main.py`), by `backend/app/collector/main.py`
and by `backend/app/worker/main.py`, at the level `LOG_LEVEL`.

- **Renderer, by `ENVIRONMENT`.** `production`: `JSONRenderer`, one object per line, with `event`,
  `level`, `logger`, `timestamp` (ISO 8601, UTC) and the bound fields; an exception becomes an
  `exception` string. Any other value: `ConsoleRenderer`, for reading in a terminal.
- **Stdlib too.** `logging.getLogger(...)` calls (the collector's, `httpx`, uvicorn's loggers) go
  through the same processors through a `ProcessorFormatter`, so they come out in the same format
  and no call has to change. uvicorn's `uvicorn`, `uvicorn.error` and `uvicorn.access` loggers
  are routed to the root once the lifespan runs; the lines uvicorn prints before it (the start-up
  banner) keep uvicorn's own format.
- **Request id.** `RequestIdMiddleware` (`backend/app/core/main.py`) takes the caller's
  `x-request-id` when it has 1 to 128 characters of `A-Za-z0-9._-`, and generates a 32-character hex
  id otherwise, so a caller cannot put arbitrary text in the logs. The id goes back in the
  `x-request-id` response header (also the WebSocket handshake). The middleware binds `request_id`,
  `route` (the route template, such as `/api/v1/...{id}`; `unmatched` for a path with no route) and
  `method` to the context, so every line written while the request runs carries them. It is
  cleared when the request ends.
- **Event names.** `domain.action` with named fields, not sentences: `api.starting`
  (`environment`), `worker.started` (`consumers`), `worker.queue_read_failed` and `worker.job_failed`
  (`consumer`, `type`, `source`, `error`, the error text cut to 300 characters). The other log
  calls (the collector's `falha no laço ...`, `falha no município`, `falha na seção`; the
  processor's messages; `hub.py`) keep their Portuguese text: they were not rewritten.
- `httpx` is set to `WARNING` in the collector.
