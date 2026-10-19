"""FastAPI application factory. Run with: uvicorn app.main:create_app --factory"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException

from app.config import Settings, get_settings
from app.db import make_engine, make_sessionmaker
from app.errors import AppError
from app.observability import RequestContextMiddleware, configure_logging, error_response
from app.routes import auth, leads, webhooks
from app.security import DbDep, FailedLoginThrottle

HTTP_CODES = {404: "not_found", 405: "method_not_allowed"}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await engine.dispose()

    docs = not settings.production  # no public API map in production
    app = FastAPI(
        title="IREC API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        openapi_url="/api/openapi.json" if docs else None,
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = make_sessionmaker(engine)
    app.state.login_throttle = FailedLoginThrottle()
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Only location and message: never echo the submitted values back.
        details = [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]
        return error_response(422, "invalid_request", "Some fields are missing or invalid.", details)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        return error_response(exc.status_code, HTTP_CODES.get(exc.status_code, "http_error"), str(exc.detail))

    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(leads.router, prefix="/api")
    app.include_router(webhooks.router, prefix="/webhooks")

    @app.get("/api/healthz", tags=["ops"])
    async def healthz(session: DbDep) -> dict[str, str]:
        await session.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app
