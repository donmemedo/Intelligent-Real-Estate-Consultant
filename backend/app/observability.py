"""JSON logs with a request id on every line, plus the request-context middleware."""

import json
import logging
import re
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

request_id: ContextVar[str] = ContextVar("request_id", default="-")
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9-]{8,64}")
log = logging.getLogger("irec")


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Structured fields go in `extra={"fields": {...}}`."""

    def format(self, record: logging.LogRecord) -> str:
        data = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id.get(),
            **getattr(record, "fields", {}),
        }
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, default=str)


def error_response(status: int, code: str, message: str, details: list[dict[str, Any]] | None = None) -> JSONResponse:
    """The one error shape every endpoint returns: {"error": {code, message, request_id[, details]}}."""
    error: dict[str, Any] = {"code": code, "message": message, "request_id": request_id.get()}
    if details:
        error["details"] = details
    return JSONResponse({"error": error}, status_code=status)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=level, handlers=[handler], force=True)
    logging.getLogger("uvicorn.access").disabled = True  # RequestContextMiddleware logs requests


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a request id, logs one access line, and adds safe default headers.

    Query strings and bodies are never logged: they can carry tokens or personal data.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get("x-request-id", "")
        rid = incoming if _VALID_REQUEST_ID.fullmatch(incoming) else uuid.uuid4().hex
        token = request_id.set(rid)
        start = time.perf_counter()
        status = 500
        try:
            try:
                response = await call_next(request)
            except Exception:
                # Last resort: log the traceback, give the client only the request id.
                log.exception("unhandled error")
                response = error_response(500, "internal_error", "Something went wrong. Please try again.")
            status = response.status_code
            response.headers["X-Request-ID"] = rid
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers.setdefault("Cache-Control", "no-store")
            return response
        finally:
            fields = {
                "method": request.method,
                "path": request.url.path,
                "status": status,
                "duration_ms": round((time.perf_counter() - start) * 1000, 1),
            }
            log.info("request", extra={"fields": fields})
            request_id.reset(token)
