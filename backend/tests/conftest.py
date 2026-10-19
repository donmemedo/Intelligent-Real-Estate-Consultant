"""Fixtures. Integration tests need a real PostgreSQL (RLS, SKIP LOCKED, ON CONFLICT).

Set TEST_DATABASE_URL to an owner/superuser URL of a throwaway database, e.g.
    postgresql+psycopg://postgres:postgres@localhost:5432/irec_test
The schema is rebuilt by the real migration; the app connects as `irec_app`, like production.
"""

import hashlib
import hmac
import json
import os
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app import cli
from app.config import Settings
from app.main import create_app
from app.models import ROLES

OWNER_URL = os.environ.get("TEST_DATABASE_URL", "")
APP_PASSWORD = "irec-app-test"
APP_URL = make_url(OWNER_URL).set(username="irec_app", password=APP_PASSWORD) if OWNER_URL else None
ORIGIN = "https://irec.test"
APP_SECRET = "test-app-secret"
VERIFY_TOKEN = "verify-me"
PASSWORD = "correct horse battery staple"
TABLES = "audit_log, outbox, handoffs, inbound_messages, suppressions, leads, contacts, sessions, users, channel_accounts, agencies"
BACKEND = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
def owner_engine() -> Iterator[Engine]:
    if not OWNER_URL:
        pytest.skip("TEST_DATABASE_URL is not set")
    engine = create_engine(OWNER_URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    config.set_main_option("sqlalchemy.url", OWNER_URL.replace("%", "%%"))
    command.upgrade(config, "head")
    with engine.begin() as conn:
        conn.execute(text(f"ALTER ROLE irec_app PASSWORD '{APP_PASSWORD}'"))
    yield engine
    engine.dispose()


@pytest.fixture
def db(owner_engine: Engine) -> Engine:
    """Empty tables before each test. Use it (as owner, bypassing RLS) to seed and to inspect."""
    with owner_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
        conn.execute(text("UPDATE system_settings SET kill_switch = false"))
    return owner_engine


@pytest.fixture
def settings(owner_engine: Engine) -> Settings:
    assert APP_URL is not None
    return Settings(
        env="test",
        database_url=APP_URL.render_as_string(hide_password=False),
        public_origin=ORIGIN,
        whatsapp_app_secret=APP_SECRET,
        whatsapp_verify_token=VERIFY_TOKEN,
        whatsapp_token="wa-token",
        whatsapp_api_base="https://graph.test/v24.0",
    )


@pytest.fixture
async def app(db: Engine, settings: Settings) -> AsyncIterator[FastAPI]:
    application = create_app(settings)
    yield application
    await application.state.engine.dispose()


def new_client(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=ORIGIN, headers={"Origin": ORIGIN})


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    async with new_client(app) as c:
        yield c


@pytest.fixture
async def login(app: FastAPI) -> AsyncIterator[Callable[[str], Awaitable[httpx.AsyncClient]]]:
    """login(email) -> a client signed in as that user. Each user gets their own cookie jar."""
    clients: list[httpx.AsyncClient] = []

    async def _login(email: str) -> httpx.AsyncClient:
        c = new_client(app)
        clients.append(c)
        response = await c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert response.status_code == 200, response.text
        return c

    yield _login
    for c in clients:
        await c.aclose()


def seed_agency(engine: Engine, slug: str, phone_number_id: str) -> SimpleNamespace:
    """An agency with one user per role, a second adviser and a WhatsApp number."""
    with Session(engine) as session, session.begin():
        agency = cli.create_agency(session, f"Agency {slug}")
        ids: dict[str, Any] = {
            role: cli.create_user(session, agency.id, f"{role}@{slug}.test", role.title(), role, PASSWORD).id
            for role in ROLES
        }
        ids["adviser2"] = cli.create_user(session, agency.id, f"adviser2@{slug}.test", "Omar", "adviser", PASSWORD).id
        account = cli.add_whatsapp(session, agency.id, phone_number_id)
        return SimpleNamespace(id=agency.id, slug=slug, phone_number_id=phone_number_id, account=account.id, **ids)


def email(agency: SimpleNamespace, who: str) -> str:
    return f"{who}@{agency.slug}.test"


@pytest.fixture
def agency(db: Engine) -> SimpleNamespace:
    return seed_agency(db, "a", "PNID-A")


@pytest.fixture
def other_agency(db: Engine) -> SimpleNamespace:
    return seed_agency(db, "b", "PNID-B")


def text_message(wamid: str, body: str, sender: str = "971501234567") -> dict[str, Any]:
    return {"from": sender, "id": wamid, "timestamp": "1760000000", "type": "text", "text": {"body": body}}


def wa_payload(
    phone_number_id: str, messages: list[dict[str, Any]] | None = None, statuses: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    value = {
        "messaging_product": "whatsapp",
        "metadata": {"display_phone_number": "97140000000", "phone_number_id": phone_number_id},
        "contacts": [{"profile": {"name": "Maya Khan"}, "wa_id": "971501234567"}],
        "messages": messages or [],
        "statuses": statuses or [],
    }
    return {
        "object": "whatsapp_business_account",
        "entry": [{"id": "WABA", "changes": [{"field": "messages", "value": value}]}],
    }


async def post_webhook(client: httpx.AsyncClient, payload: dict[str, Any], secret: str = APP_SECRET) -> httpx.Response:
    body = json.dumps(payload).encode()
    signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return await client.post(
        "/webhooks/whatsapp",
        content=body,
        headers={"X-Hub-Signature-256": signature, "Content-Type": "application/json"},
    )


def scalar(engine: Engine, sql: str, **params: Any) -> Any:
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar()


def rows(engine: Engine, sql: str, **params: Any) -> list[Any]:
    with engine.connect() as conn:
        return list(conn.execute(text(sql), params))


async def inbound_lead(
    client: httpx.AsyncClient, db: Engine, agency: SimpleNamespace, body: str = "Hi, I want a 2-bedroom"
) -> str:
    """Deliver one WhatsApp message to `agency` and return the resulting lead id."""
    response = await post_webhook(client, wa_payload(agency.phone_number_id, [text_message(f"wamid.{body}", body)]))
    assert response.status_code == 200, response.text
    return str(scalar(db, "SELECT id FROM leads WHERE agency_id = :a", a=agency.id))
